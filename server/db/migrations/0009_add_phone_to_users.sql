-- Add optional phone number to users for SMS claim link delivery
ALTER TABLE users ADD COLUMN phone TEXT;
