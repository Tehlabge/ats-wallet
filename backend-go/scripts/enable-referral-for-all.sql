-- Включить реферальную систему для всех пользователей (isPartner = true).
-- PostgreSQL: psql -U wallet -d wallet -f scripts/enable-referral-for-all.sql
UPDATE users SET "isPartner" = true WHERE "isPartner" = false;
