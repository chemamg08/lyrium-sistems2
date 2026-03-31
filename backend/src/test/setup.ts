// Mock environment variables before anything else
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_testing';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_fake_secret';
process.env.STRIPE_PRICE_STARTER_MONTHLY = 'price_starter_monthly_test';
process.env.STRIPE_PRICE_STARTER_ANNUAL = 'price_starter_annual_test';
process.env.STRIPE_PRICE_ADVANCED_MONTHLY = 'price_advanced_monthly_test';
process.env.STRIPE_PRICE_ADVANCED_ANNUAL = 'price_advanced_annual_test';
process.env.FRONTEND_URL = 'http://localhost:8080';
process.env.SYSTEM_EMAIL_HOST = 'smtp-relay.brevo.com';
process.env.SYSTEM_EMAIL_PORT = '587';
process.env.SYSTEM_EMAIL_USER = 'test@lyrium.io';
process.env.SYSTEM_EMAIL_PASS = 'fake_pass';
process.env.SYSTEM_EMAIL_LOGIN = 'test@smtp-brevo.com';
process.env.INVOICE_OWNER_NAME = 'Test Owner';
process.env.INVOICE_OWNER_NIF = 'B12345678';
process.env.INVOICE_OWNER_ADDRESS = 'Test Address 123';
