// #371: the catch of a transaction opened by hand (sequelize.transaction()
// without a function) rolls it back before the error goes on. Sometimes the
// transaction has already ended at that point:
// - MySQL found a deadlock: it undid the transaction itself, and Sequelize
//   marked it as rolled back;
// - the error came after t.commit().
// Then t.rollback() throws "Transaction cannot be rolled back because it has
// been finished", and that new error took the place of the real one: the
// catch stopped there and the log only had the rollback message.
// safeRollback only rolls back a transaction that has not ended, and it never
// throws: if the rollback itself fails, that goes to the log and the real
// error still goes on.
async function safeRollback(t) {
    if (!t || t.finished) return;
    try {
        await t.rollback();
    } catch (error) {
        console.error('Rolling back the transaction failed:', error);
    }
}

module.exports = { safeRollback };
