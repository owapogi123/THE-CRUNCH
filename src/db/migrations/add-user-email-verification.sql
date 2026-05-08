ALTER TABLE users
ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0,
ADD COLUMN email_verification_code VARCHAR(10) NULL,
ADD COLUMN email_verification_expires DATETIME NULL;
