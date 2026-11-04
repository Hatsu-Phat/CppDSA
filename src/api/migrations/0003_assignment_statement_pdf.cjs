exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('assignments', {
    statement_storage: {
      type: 'varchar(16)',
      notNull: false,
    },
    statement_file_id: {
      type: 'text',
      notNull: false,
    },
    statement_file_name: {
      type: 'varchar(255)',
      notNull: false,
    },
    statement_file_size: {
      type: 'integer',
      notNull: false,
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('assignments', [
    'statement_storage',
    'statement_file_id',
    'statement_file_name',
    'statement_file_size',
  ]);
};
