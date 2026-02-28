package middleware

import (
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

type AdminClaims struct {
	jwt.RegisteredClaims
	Admin   *bool `json:"admin,omitempty"`
	AdminID *int  `json:"adminId,omitempty"`
	Login   string `json:"login,omitempty"`
	Role    string `json:"role,omitempty"`
}

type UserClaims struct {
	jwt.RegisteredClaims
	Sub   string `json:"sub,omitempty"`
	Phone string `json:"phone,omitempty"`
	Jti   string `json:"jti,omitempty"`
}

func AdminAuth(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		auth := c.GetHeader("Authorization")
		tokenStr := ""
		if strings.HasPrefix(auth, "Bearer ") {
			tokenStr = strings.TrimPrefix(auth, "Bearer ")
		}
		if tokenStr == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Admin auth required"})
			c.Abort()
			return
		}
		var claims AdminClaims
		token, err := jwt.ParseWithClaims(tokenStr, &claims, func(t *jwt.Token) (interface{}, error) {
			return []byte(secret), nil
		})
		if err != nil {
			log.Printf("[AdminAuth] JWT parse error: %v", err)
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Invalid admin token"})
			c.Abort()
			return
		}
		if !token.Valid {
			log.Printf("[AdminAuth] Token invalid")
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Invalid admin token"})
			c.Abort()
			return
		}
		if claims.Admin == nil || !*claims.Admin {
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Invalid admin token"})
			c.Abort()
			return
		}
		c.Set("admin", true)
		c.Set("adminLogin", claims.Login)
		c.Set("adminRole", claims.Role)
		if claims.AdminID != nil {
			c.Set("adminId", *claims.AdminID)
		}
		if c.GetString("adminRole") == "" {
			c.Set("adminRole", "super")
		}
		c.Next()
	}
}

// RequireSuper разрешает доступ только супер-админу (role == "super").
func RequireSuper() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.GetString("adminRole") != "super" {
			c.JSON(http.StatusForbidden, gin.H{"message": "Доступ только для супер-админа"})
			c.Abort()
			return
		}
		c.Next()
	}
}

func UserAuth(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		auth := c.GetHeader("Authorization")
		tokenStr := ""
		if strings.HasPrefix(auth, "Bearer ") {
			tokenStr = strings.TrimPrefix(auth, "Bearer ")
		}
		if tokenStr == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Auth required"})
			c.Abort()
			return
		}
		var claims UserClaims
		token, err := jwt.ParseWithClaims(tokenStr, &claims, func(t *jwt.Token) (interface{}, error) {
			return []byte(secret), nil
		})
		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Invalid token"})
			c.Abort()
			return
		}
		if claims.Sub == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Invalid token"})
			c.Abort()
			return
		}
		c.Set("userId", claims.Sub)
		c.Set("userPhone", claims.Phone)
		c.Set("jti", claims.Jti)
		c.Next()
	}
}
