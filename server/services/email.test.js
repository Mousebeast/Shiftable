'use strict';
process.env.DB_PATH = ':memory:';

const path = require('path');
const fs = require('fs');

const db = require('../db/db');
db.exec(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

const nodemailer = require('nodemailer');

const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test' });
const mockTransporter = { sendMail: mockSendMail };

beforeEach(() => {
  jest.clearAllMocks();
  db.prepare('DELETE FROM app_settings').run();
});

// Require after mocks so nodemailer is already mocked
let email;
beforeAll(() => {
  email = require('./email');
});

const USER = { id: 1, name: 'Alice', email: 'alice@example.com' };
const CLAIM_URL = 'http://localhost:5173/claim?token=abc123';

describe('sendWelcomeEmail', () => {
  it('sends welcome email when SMTP is configured', async () => {
    nodemailer.createTransport.mockReturnValue(mockTransporter);
    db.prepare("INSERT INTO app_settings VALUES ('smtp_host', 'smtp.example.com')").run();

    await email.sendWelcomeEmail(USER, CLAIM_URL);

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.example.com' })
    );
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: USER.email,
        subject: expect.stringContaining('Welcome'),
        text: expect.stringContaining(CLAIM_URL),
        html: expect.stringContaining(CLAIM_URL),
      })
    );
  });

  it('does nothing silently when SMTP not configured', async () => {
    // No smtp_host in app_settings
    await email.sendWelcomeEmail(USER, CLAIM_URL);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('does not throw if sendMail rejects', async () => {
    nodemailer.createTransport.mockReturnValue({ sendMail: jest.fn().mockRejectedValue(new Error('SMTP error')) });
    db.prepare("INSERT INTO app_settings VALUES ('smtp_host', 'smtp.example.com')").run();
    await expect(email.sendWelcomeEmail(USER, CLAIM_URL)).resolves.not.toThrow();
  });
});

describe('sendPinResetEmail', () => {
  it('sends PIN reset email when SMTP is configured', async () => {
    nodemailer.createTransport.mockReturnValue(mockTransporter);
    db.prepare("INSERT INTO app_settings VALUES ('smtp_host', 'smtp.example.com')").run();

    await email.sendPinResetEmail(USER, CLAIM_URL);

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: USER.email,
        subject: expect.stringMatching(/PIN|reset/i),
        text: expect.stringContaining(CLAIM_URL),
      })
    );
  });

  it('does nothing when SMTP not configured', async () => {
    await email.sendPinResetEmail(USER, CLAIM_URL);
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});
