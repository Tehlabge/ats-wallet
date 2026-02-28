-- Поддержка эмодзи в чате поддержки (исправление ошибки Conversion from collation utf8mb4_general_ci into utf8_general_ci).
-- Выполнить на БД, если при отправке сообщений с эмодзи возникает ошибка 3988.
ALTER TABLE support_messages CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE support_thread_closes CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
