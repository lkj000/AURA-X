exports.up = function(knex) {
  return knex.schema
    .createTable('users', table => {
      table.increments('id').primary();
      table.string('username').notNullable().unique();
      table.string('email').notNullable().unique();
      table.integer('credit_balance').defaultTo(100);
      table.timestamps(true, true);
    })
    .createTable('styles', table => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().references('id').inTable('users');
      table.string('title').notNullable();
      table.string('experience_type').notNullable().defaultTo('audio'); // For AR/VR
      table.integer('price_credits').notNullable();
      table.timestamps(true, true);
    })
    .createTable('transactions', table => {
      table.increments('id').primary();
      table.integer('buyer_id').unsigned().references('id').inTable('users');
      table.integer('recipient_id').unsigned().references('id').inTable('users');
      table.integer('style_id').unsigned().references('id').inTable('styles');
      table.integer('amount').notNullable();
      table.timestamp('purchase_date').defaultTo(knex.fn.now());
    });
};

exports.down = function(knex) {
  return knex.schema.dropTable('transactions').dropTable('styles').dropTable('users');
};