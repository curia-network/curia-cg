import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  console.log('[Migration] Adding community ownership and extending user_communities for membership management...');

  // Extend communities table with ownership and access control
  pgm.addColumn('communities', {
    owner_user_id: {
      type: 'text',
      notNull: false, // Nullable for existing communities during migration
      references: 'users(user_id)',
      onDelete: 'SET NULL',
      comment: 'User who owns/created this community'
    },
    is_public: {
      type: 'boolean',
      notNull: true,
      default: true,
      comment: 'Whether the community is publicly discoverable'
    },
    requires_approval: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'Whether joining requires owner approval'
    }
  });

  // Extend existing user_communities table with membership management fields
  pgm.addColumn('user_communities', {
    role: {
      type: 'varchar(20)',
      notNull: true,
      default: 'member',
              comment: 'User role in the community (member, moderator, owner)'
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'active',
      comment: 'Membership status (active, pending, banned, left)'
    },
    invited_by_user_id: {
      type: 'text',
      notNull: false,
      references: 'users(user_id)',
      onDelete: 'SET NULL',
      comment: 'User who invited this member (if applicable)'
    }
  });

  // Add constraints to validate role and status values
  pgm.addConstraint('user_communities', 'check_user_community_role', {
            check: "role IN ('member', 'moderator', 'owner')"
  });

  pgm.addConstraint('user_communities', 'check_user_community_status', {
    check: "status IN ('active', 'pending', 'banned', 'left')"
  });

  // Add indexes for performance on communities table
  pgm.createIndex('communities', 'owner_user_id', {
    name: 'idx_communities_owner'
  });

  pgm.createIndex('communities', 'is_public', {
    name: 'idx_communities_public',
    where: 'is_public = true'
  });

  // Add indexes for performance on user_communities table (for new fields)
  pgm.createIndex('user_communities', ['community_id', 'status'], {
    name: 'idx_user_communities_community_status'
  });

  pgm.createIndex('user_communities', ['user_id', 'status'], {
    name: 'idx_user_communities_user_status'
  });

  pgm.createIndex('user_communities', 'role', {
    name: 'idx_user_communities_role'
  });

  pgm.createIndex('user_communities', 'invited_by_user_id', {
    name: 'idx_user_communities_invited_by',
    where: 'invited_by_user_id IS NOT NULL'
  });

  console.log('[Migration] ✅ Added community ownership and extended user_communities with membership management');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  console.log('[Migration] Removing community ownership and membership extensions...');

  // Drop constraints first
  pgm.dropConstraint('user_communities', 'check_user_community_role');
  pgm.dropConstraint('user_communities', 'check_user_community_status');

  // Drop indexes from user_communities
  pgm.dropIndex('user_communities', 'idx_user_communities_community_status');
  pgm.dropIndex('user_communities', 'idx_user_communities_user_status');
  pgm.dropIndex('user_communities', 'idx_user_communities_role');
  pgm.dropIndex('user_communities', 'idx_user_communities_invited_by');

  // Remove columns from user_communities table
  pgm.dropColumn('user_communities', 'role');
  pgm.dropColumn('user_communities', 'status');
  pgm.dropColumn('user_communities', 'invited_by_user_id');

  // Remove columns from communities table
  pgm.dropColumn('communities', 'owner_user_id');
  pgm.dropColumn('communities', 'is_public');
  pgm.dropColumn('communities', 'requires_approval');

  console.log('[Migration] ✅ Removed community ownership and membership extensions');
}
