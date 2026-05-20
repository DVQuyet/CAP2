const db = require('../../config/db');

const NO_TABLE_OR_COLUMN = new Set(['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR', 'ER_SP_DOES_NOT_EXIST']);

const queryMaybe = async (connection, sql, params = []) => {
  try {
    return await connection.query(sql, params);
  } catch (error) {
    if (NO_TABLE_OR_COLUMN.has(error.code)) {
      return [{ affectedRows: 0 }, []];
    }
    throw error;
  }
};

const deleteByIds = async (connection, table, column, ids) => {
  const cleanIds = [...new Set((ids || []).map(Number).filter((id) => Number.isFinite(id) && id > 0))];
  if (!cleanIds.length) return 0;
  const [result] = await queryMaybe(
    connection,
    `DELETE FROM ${table} WHERE ${column} IN (${cleanIds.map(() => '?').join(',')})`,
    cleanIds
  );
  return result?.affectedRows || 0;
};

/**
 * Xoa sach mot person khoi cay gia pha va cac bang lien quan.
 *
 * - Neu person la vo/chong/cha/me: xoa toan bo family row do va cac children link trong family do.
 * - Neu person la con: xoa link children tro toi person.
 * - Xoa cac du lieu phu tro toi people.id de tranh FK loi / ban ghi mo coi.
 * - Mac dinh chi go node khoi cay va unlink account; neu deleteAccounts=true thi xoa luon account login gan voi person.
 */
const deletePersonCompletely = async (personId, options = {}) => {
  const targetPersonId = Number(personId);
  if (!Number.isFinite(targetPersonId) || targetPersonId <= 0) {
    const err = new Error('person_id khong hop le');
    err.status = 400;
    throw err;
  }

  const externalConnection = options.connection || null;
  const connection = externalConnection || await db.getConnection();
  const shouldManageTransaction = !externalConnection;
  const deleteAccounts = Boolean(options.deleteAccounts);

  try {
    if (shouldManageTransaction) await connection.beginTransaction();

    const [personRows] = await connection.query('SELECT id FROM people WHERE id = ? LIMIT 1', [targetPersonId]);
    if (!personRows.length) {
      const err = new Error('Khong tim thay nguoi trong gia pha');
      err.status = 404;
      throw err;
    }

    const [accountRows] = await queryMaybe(connection, 'SELECT id FROM accounts WHERE person_id = ?', [targetPersonId]);
    const accountIds = accountRows.map((row) => Number(row.id)).filter(Number.isFinite);

    const [familyRows] = await connection.query('SELECT id FROM families WHERE father_id = ? OR mother_id = ?', [
      targetPersonId,
      targetPersonId,
    ]);
    const familyIds = familyRows.map((row) => Number(row.id)).filter(Number.isFinite);

    // Xoa quan he cha/me/con nam trong cac family co person nay la vo/chong/cha/me.
    await deleteByIds(connection, 'children', 'family_id', familyIds);
    await deleteByIds(connection, 'families', 'id', familyIds);

    // Xoa quan he person nay dang la con cua mot family khac.
    await connection.query('DELETE FROM children WHERE person_id = ?', [targetPersonId]);

    // Don cac bang phu khong phai luc nao cung co trong database cu.
    await queryMaybe(connection, 'DELETE FROM account_clans WHERE person_id = ?', [targetPersonId]);
    await queryMaybe(connection, 'DELETE FROM manager_task_assignments WHERE member_person_id = ?', [targetPersonId]);
    await queryMaybe(connection, 'DELETE FROM member_tree_edit_keys WHERE member_person_id = ?', [targetPersonId]);
    await queryMaybe(connection, 'DELETE FROM notifications WHERE receiver_person_id = ?', [targetPersonId]);
    await queryMaybe(connection, 'DELETE FROM event_contributions WHERE person_id = ?', [targetPersonId]);
    await queryMaybe(connection, 'DELETE FROM post_likes WHERE person_id = ?', [targetPersonId]);
    await queryMaybe(connection, 'DELETE FROM post_comments WHERE person_id = ?', [targetPersonId]);

    // Xoa person se kich hoat cac FK ON DELETE CASCADE/SET NULL neu DB co khai bao.
    const [deletedPerson] = await connection.query('DELETE FROM people WHERE id = ?', [targetPersonId]);

    if (deleteAccounts && accountIds.length) {
      await deleteByIds(connection, 'accounts', 'id', accountIds);
    }

    if (shouldManageTransaction) await connection.commit();

    return {
      person_id: targetPersonId,
      deleted_person_rows: deletedPerson?.affectedRows || 0,
      deleted_family_ids: familyIds,
      affected_account_ids: accountIds,
      deleted_accounts: deleteAccounts ? accountIds : [],
    };
  } catch (error) {
    if (shouldManageTransaction) {
      try { await connection.rollback(); } catch (_) {}
    }
    throw error;
  } finally {
    if (shouldManageTransaction) connection.release();
  }
};

module.exports = {
  deletePersonCompletely,
};
