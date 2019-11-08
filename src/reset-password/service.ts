import { BadRequest } from '@curveball/http-errors';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import database from '../database';
import { render } from '../templates';
import * as userService from '../user/service';
import { User } from '../user/types';

const tokenTTL = 7200;

export async function sendResetPasswordEmail(user: User) {

    if (!process.env.SMTP_EMAIL_FROM) {
        throw new Error('The environment variable SMTP_EMAIL_FROM must be set');
    }

    if (!process.env.SMTP_URL) {
        throw new Error('The environment variable SMTP_URL must be set. Needs to contain "smtps://[Username]:[Password]@[Host]:[Port]"');
    }

    const transporter = nodemailer.createTransport(process.env.SMTP_URL);
    const token = await createToken(user);
    const emailTemplate = render('emails/reset-password-email', {
        name: user.nickname,
        url: process.env.PUBLIC_URI + 'reset-password/token/' + token,
        expiryHours: tokenTTL / 60 / 60
    });

    // send mail with defined transport object
    const info = await transporter.sendMail({
        from: process.env.SMTP_EMAIL_FROM, // sender address
        to: user.identity.substring(7), // list of receivers
        subject: 'Password reset request', // Subject line
        html: emailTemplate
    });

    nodemailer.getTestMessageUrl(info);
}

export async function createToken(user: User): Promise<string> {
    const token = crypto.randomBytes(32).toString('base64').replace('+', '-').replace('/', '_').replace(/=+$/, '');
    const query = 'INSERT INTO reset_password_token SET user_id = ?, token = ?, expires_at = UNIX_TIMESTAMP() + ?, created_at = UNIX_TIMESTAMP()';

    await database.query(query, [
        user.id,
        token,
        tokenTTL
    ]);
    return token;
}

export async function validateToken(token: string): Promise<User> {

    const query = 'SELECT token, user_id FROM reset_password_token WHERE token = ? AND expires_at > UNIX_TIMESTAMP()';
    const result = await database.query(query, [token]);

    if (result[0].length !== 1) {
      throw new BadRequest ('Invaild Token');
    } else {
      await database.query('DELETE FROM reset_password_token WHERE token = ?', [token]);
      return userService.findById(result[0][0].user_id);
    }

}
