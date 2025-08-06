import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Create chat_channels_id_seq sequence
  pgm.createSequence('chat_channels_id_seq', {
    increment: 1,
    minvalue: 1,
    maxvalue: 2147483647,
    cache: 1,
  });

  // Create chat_channels table
  pgm.createTable('chat_channels', {
    id: {
      type: 'integer',
      primaryKey: true,
      default: pgm.func("nextval('chat_channels_id_seq')"),
      notNull: true,
    },
    community_id: {
      type: 'text',
      notNull: true,
      references: '"communities"',
      onDelete: 'CASCADE',
    },
    name: {
      type: 'varchar(255)',
      notNull: true,
    },
    description: {
      type: 'text',
      notNull: false,
    },
    irc_channel_name: {
      type: 'varchar(255)',
      notNull: true,
    },
    is_single_mode: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    is_default: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    settings: {
      type: 'jsonb',
      notNull: true,
      default: '{}',
    },
  });

  // Create indexes
  pgm.createIndex('chat_channels', 'community_id');
  pgm.createIndex('chat_channels', ['community_id', 'name'], { unique: true });
  pgm.createIndex('chat_channels', ['community_id', 'irc_channel_name'], { unique: true });
  pgm.createIndex('chat_channels', 'settings', { method: 'gin' });
  pgm.createIndex('chat_channels', 'is_single_mode');
  pgm.createIndex('chat_channels', ['community_id', 'is_default'], { 
    where: 'is_default = true',
    name: 'chat_channels_community_default_idx'
  });

  // Add trigger for updating updated_at timestamp
  pgm.createTrigger('chat_channels', 'set_timestamp_chat_channels', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'trigger_set_timestamp',
    level: 'ROW',
  });

  // Add constraint to ensure only one default channel per community
  pgm.addConstraint('chat_channels', 'chat_channels_one_default_per_community', 
    'EXCLUDE (community_id WITH =) WHERE (is_default = true)'
  );
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Drop constraint first
  pgm.dropConstraint('chat_channels', 'chat_channels_one_default_per_community');
  
  // Drop trigger
  pgm.dropTrigger('chat_channels', 'set_timestamp_chat_channels');
  
  // Drop indexes (table drop will handle this, but being explicit)
  pgm.dropIndex('chat_channels', ['community_id', 'is_default'], { 
    name: 'chat_channels_community_default_idx'
  });
  pgm.dropIndex('chat_channels', 'is_single_mode');
  pgm.dropIndex('chat_channels', 'settings');
  pgm.dropIndex('chat_channels', ['community_id', 'irc_channel_name']);
  pgm.dropIndex('chat_channels', ['community_id', 'name']);
  pgm.dropIndex('chat_channels', 'community_id');
  
  // Drop table
  pgm.dropTable('chat_channels');
  
  // Drop sequence
  pgm.dropSequence('chat_channels_id_seq');
}
