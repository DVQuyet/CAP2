const dashboardController = require('./dashboard.controller');
const memberController = require('./member.controller');
const moderationController = require('./moderation.controller');
const eventTaskController = require('./eventTask.controller');
const treeController = require('../genealogy/tree.controller');
const genealogyAuditController = require('../genealogy/genealogyAudit.controller');
const duplicatesController = require('../genealogy/duplicates.controller');

module.exports = {
    ...dashboardController,
    ...memberController,
    ...moderationController,
    ...eventTaskController,
    ...treeController,
    ...genealogyAuditController,
    ...duplicatesController,
};
