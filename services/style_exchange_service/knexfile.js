// This is the Knex.js configuration file. It is responsible for
// telling Knex how to connect to your database for different environments
// (development, staging, production).

// We use the `dotenv` package to load environment variables from the .env file
// located in the monorepo root.
require('dotenv').config({ path: '../../.env' });

module.exports = {
  /**
   * Development Environment Configuration
   *
   * This is the configuration that will be used when you run Knex commands
   * on your local development machine. It reads the database connection string
   * directly from the master `.env` file.
   */
  development: {
    client: 'postgresql',
    connection: {
      connectionString: process.env.DATABASE_URL,
      // If you need SSL for a local connection (rarely), you can add it here.
      // ssl: { rejectUnauthorized: false },
    },
    // This specifies the directory where all migration files are stored.
    migrations: {
      directory: './db/migrations'
    },
    // (Optional) This specifies the directory for seed files, which are
    // used to populate the database with initial test data.
    seeds: {
      directory: './db/seeds'
    }
  },

  /**
   * Staging Environment Configuration
   *
   * This configuration would be used by your CI/CD pipeline when deploying
   * to a staging or testing environment. It would typically use a different
   * DATABASE_URL environment variable provided by the CI/CD system.
   */
  staging: {
    client: 'postgresql',
    connection: {
      connectionString: process.env.STAGING_DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // Staging dbs often require SSL
    },
    migrations: {
      directory: './db/migrations'
    },
    seeds: {
      directory: './db/seeds'
    }
  },

  /**
   * Production Environment Configuration
   *
   * This is the configuration for your live, production database.
   * It is critical that the PRODUCTION_DATABASE_URL is a secure, managed
   * secret (e.g., from AWS Secrets Manager) and not hard-coded.
   */
  production: {
    client: 'postgresql',
    connection: {
      connectionString: process.env.PRODUCTION_DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // Production databases always require SSL
    },
    migrations: {
      directory: './db/migrations'
    },
    // It's generally not recommended to run seeds in production.
  }
};