-- Only the default for future accounts changes; existing choices are untouched.
ALTER TABLE users ALTER COLUMN theme SET DEFAULT 'eclipse';
