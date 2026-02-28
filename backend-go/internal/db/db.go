package db

import (
	"fmt"
	"log"
	"strings"
	"time"

	"ats-wallet/internal/config"
	"ats-wallet/internal/models"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func New(cfg *config.Config) (*gorm.DB, error) {
	port := strings.TrimSpace(cfg.DBPort)
	if port == "" {
		port = "5432"
	}
	host := strings.TrimSpace(cfg.DBHost)
	user := strings.TrimSpace(cfg.DBUser)
	pass := cfg.DBPass
	name := strings.TrimSpace(cfg.DBName)
	sslMode := strings.TrimSpace(cfg.DBSSLMode)
	if sslMode == "" {
		sslMode = "disable"
	}

	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=%s TimeZone=UTC",
		host, user, pass, name, port, sslMode)

	log.Printf("[DB] Connecting to %s@%s:%s/%s (PostgreSQL)", user, host, port, name)

	sqlDB, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger:                                   logger.Default.LogMode(logger.Warn),
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		return nil, fmt.Errorf("gorm.Open: %w", err)
	}

	db, err := sqlDB.DB()
	if err != nil {
		return nil, fmt.Errorf("sqlDB.DB: %w", err)
	}
	db.SetConnMaxLifetime(time.Minute * 3)
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping failed: %w", err)
	}
	log.Printf("[DB] PostgreSQL connected successfully")

	if err := models.Migrate(sqlDB); err != nil {
		log.Printf("[DB] Migrate warning: %v", err)
	}

	return sqlDB, nil
}
