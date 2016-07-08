'use strict';

/**
 * @param knex
 * @param {{}} options
 * @returns {Promise} fulfils with the seed SQL output
 */
module.exports = function resetDb(knex, options) {
    let tables;
    options = Object.assign({}, {
        skipTables: [], // array of tables to ignore
        seedSql: false, // a string or buffer of SQL to run immediately after truncation. converted to utf8
        resetSequences: true, // if true, reset sequences after truncation. affected by skipTables
        logger: { // replace this with a nicer logger if needed
            log: () => {},
            warn: console.warn.bind(console),
            error: console.error.bind(console),
        },
    }, options);
    const { log, warn, error } = options.logger;
    const { seedSql } = options;
    return knex.schema.raw(`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'`)
        .then(queryResult => {
            tables = queryResult.rows.map(row => row.tablename).sort();
            if (options.skipTables.length) {
                tables = tables.filter(table => options.skipTables.includes(table));
            }
            log('Truncating tables', tables);
            return knex.schema.raw(`TRUNCATE ${tables.join(',')} CASCADE`);
        })
        .then(() => knex.raw(seedSql.toString('utf8')))
        .then((seedResult) => {
            let tap;
            if (options.resetSequences) {
                log('Resetting sequences');
                tap = Promise.all(tables.map(table => {
                    return knex.schema.raw(
                        `SELECT setval('${table}_id_seq', COALESCE((SELECT MAX(id)+1 FROM ${table}), 1), false)`
                    ).catch(() => {
                        warn('Could not reset ID sequence for', table);
                    });
                }));
            }
            return Promise.resolve(tap).then(() => seedResult);
        })
        .then(seedResult => {
            log('Reset complete');
            return seedResult;
        })
        .catch(err => {
            error('resetDb error', err);
            throw err;
        });
};
