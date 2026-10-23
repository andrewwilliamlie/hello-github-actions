/* Prints current TOTP codes for the DEMO admin accounts (demo secrets are public by design). */
import { authenticator } from "otplib";
import { DEMO_TOTP } from "../prisma/seed-constants";

for (const [email, secret] of Object.entries(DEMO_TOTP)) console.log(`${email.padEnd(26)} ${authenticator.generate(secret)}`);
console.log(`(codes rotate every 30s)`);
