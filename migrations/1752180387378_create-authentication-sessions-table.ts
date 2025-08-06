import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  console.log('[Migration] Creating authentication sessions table for standalone identity system...');

  // Create authentication_sessions table for secure session management
  pgm.createTable('authentication_sessions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    user_id: {
      type: 'text',
      notNull: true,
      references: 'users(user_id)',
      onDelete: 'CASCADE',
      comment: 'User this session belongs to'
    },
    session_token: {
      type: 'text',
      notNull: true,
      unique: true,
      comment: 'Unique session token for client authentication'
    },
    identity_type: {
      type: 'varchar(20)',
      notNull: true,
      comment: 'Type of identity used for this session (ens, universal_profile, etc.)'
    },
    wallet_address: {
      type: 'text',
      notNull: false,
      comment: 'Wallet address used to create this session'
    },
    signed_message: {
      type: 'text',
      notNull: true,
      comment: 'Original message that was signed to create this session'
    },
    signature: {
      type: 'text',
      notNull: true,
      comment: 'Cryptographic signature proving wallet control'
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
      comment: 'When the session was created'
    },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
      comment: 'When the session expires (30-day sessions)'
    },
    last_accessed_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
      comment: 'Last time this session was used'
    },
    is_active: {
      type: 'boolean',
      notNull: true,
      default: true,
      comment: 'Whether the session is currently active'
    }
  });

  // Add constraint to validate identity types
  pgm.addConstraint('authentication_sessions', 'check_session_identity_type', {
    check: "identity_type IN ('ens', 'universal_profile', 'anonymous')"
  });

  // Add indexes for performance
  pgm.createIndex('authentication_sessions', 'session_token', {
    name: 'idx_auth_sessions_token'
  });

  pgm.createIndex('authentication_sessions', ['user_id', 'is_active'], {
    name: 'idx_auth_sessions_user_active'
  });

  pgm.createIndex('authentication_sessions', 'expires_at', {
    name: 'idx_auth_sessions_expires'
  });

  pgm.createIndex('authentication_sessions', 'wallet_address', {
    name: 'idx_auth_sessions_wallet',
    where: 'wallet_address IS NOT NULL'
  });

  pgm.createIndex('authentication_sessions', ['user_id', 'created_at'], {
    name: 'idx_auth_sessions_user_created'
  });

  console.log('[Migration] ✅ Created authentication sessions table with security features');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  console.log('[Migration] Dropping authentication sessions table...');

  // Drop the entire table (indexes and constraints will be dropped automatically)
  pgm.dropTable('authentication_sessions');

  console.log('[Migration] ✅ Dropped authentication sessions table');
}
