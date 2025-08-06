import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  console.log('[Migration] Extending users table for standalone identity system...');

  // Add identity type fields to users table
  pgm.addColumn('users', {
    identity_type: {
      type: 'varchar(20)',
      notNull: true,
      default: 'legacy',
      comment: 'Type of identity: legacy (CG), ens, universal_profile, anonymous'
    },
    wallet_address: {
      type: 'text',
      notNull: false,
      comment: 'Primary wallet address for ENS/UP identities'
    },
    ens_domain: {
      type: 'text',
      notNull: false,
      comment: 'ENS domain name for ENS-based identities'
    },
    up_address: {
      type: 'text',
      notNull: false,
      comment: 'Universal Profile address for UP-based identities'
    },
    is_anonymous: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'True for temporary anonymous users'
    },
    auth_expires_at: {
      type: 'timestamptz',
      notNull: false,
      comment: 'When current authentication expires (30-day sessions)'
    },
    last_auth_at: {
      type: 'timestamptz',
      notNull: false,
      comment: 'Last time user completed wallet authentication'
    }
  });

  // Add constraint to validate identity types
  pgm.addConstraint('users', 'check_identity_type', {
    check: "identity_type IN ('legacy', 'ens', 'universal_profile', 'anonymous')"
  });

  // Add constraint to ensure identity data consistency
  pgm.sql(`
    ALTER TABLE users ADD CONSTRAINT check_identity_data
    CHECK (
      (identity_type = 'legacy' AND wallet_address IS NULL) OR
      (identity_type = 'ens' AND ens_domain IS NOT NULL AND wallet_address IS NOT NULL) OR
      (identity_type = 'universal_profile' AND up_address IS NOT NULL) OR
      (identity_type = 'anonymous' AND is_anonymous = TRUE)
    );
  `);

  // Add indexes for performance
  pgm.createIndex('users', 'identity_type', {
    name: 'idx_users_identity_type'
  });

  pgm.createIndex('users', 'wallet_address', {
    name: 'idx_users_wallet_address',
    where: 'wallet_address IS NOT NULL'
  });

  pgm.createIndex('users', 'ens_domain', {
    name: 'idx_users_ens_domain',
    where: 'ens_domain IS NOT NULL'
  });

  pgm.createIndex('users', 'up_address', {
    name: 'idx_users_up_address', 
    where: 'up_address IS NOT NULL'
  });

  pgm.createIndex('users', 'auth_expires_at', {
    name: 'idx_users_auth_expires',
    where: 'auth_expires_at IS NOT NULL'
  });

  console.log('[Migration] ✅ Extended users table with identity type support');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  console.log('[Migration] Reverting users table identity type extensions...');

  // Drop constraints first
  pgm.dropConstraint('users', 'check_identity_data');
  pgm.dropConstraint('users', 'check_identity_type');

  // Drop indexes
  pgm.dropIndex('users', 'idx_users_identity_type');
  pgm.dropIndex('users', 'idx_users_wallet_address');
  pgm.dropIndex('users', 'idx_users_ens_domain');
  pgm.dropIndex('users', 'idx_users_up_address');
  pgm.dropIndex('users', 'idx_users_auth_expires');

  // Drop columns
  pgm.dropColumn('users', 'identity_type');
  pgm.dropColumn('users', 'wallet_address');
  pgm.dropColumn('users', 'ens_domain');
  pgm.dropColumn('users', 'up_address');
  pgm.dropColumn('users', 'is_anonymous');
  pgm.dropColumn('users', 'auth_expires_at');
  pgm.dropColumn('users', 'last_auth_at');

  console.log('[Migration] ✅ Reverted users table identity type extensions');
}
