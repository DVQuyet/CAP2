// Danh sách các bước chỉnh schema trước đây chạy rải rác lúc request.
// Gom lại một chỗ để chạy một lần khi deploy (npm run migrate) thay vì trên đường xử lý request.
// Mọi bước đều idempotent (kiểm tra cột/bảng tồn tại trước khi ALTER/CREATE).
const path = require('path');

const STEPS = [
    ['calendar events', '../../modules/calendar/calendar.controller', ['ensureManagerEventsForCalendarSchema', 'ensureCalendarSchema']],
    ['manager events', '../../modules/manager/event.service', ['ensureManagerEventScheduleColumns']],
    ['manager tasks', '../../modules/manager/task.service', ['ensureTaskTables']],
    ['admin tasks', '../../modules/admin/admin.controller', ['ensureTaskTables']],
    ['member tasks', '../../modules/member/member.controller', ['ensureTaskTables']],
    ['posts interaction', '../../modules/member/member.controller', ['ensurePostInteractionTables']],
    ['family memories', '../../modules/member/member.controller', ['ensureFamilyMemoriesSchema']],
    ['family memories (manager)', '../../modules/manager/memoryModeration.service', ['ensureFamilyMemoriesSchemaForManager']],
    ['archived members', '../../modules/manager/archive.service', ['ensureArchivedMembersTable']],
    ['archived members (auth)', '../../modules/auth/auth.controller', ['ensureArchivedMembersTable']],
    ['profile completed', '../utils/profileCompletion', ['ensureProfileCompletedColumn']],
    ['password changed', '../utils/passwordChange', ['ensurePasswordChangedAtColumn']],
    ['social auth', '../../modules/auth/socialAuth.service', ['ensureSocialAuthSchema']],
    ['invitations', '../../modules/invitations/invitation.service', ['ensureInvitationSchema']],
    ['billing payments', '../../modules/billing/billing.service', ['ensurePaymentPurchaseColumns']],
    ['fund', '../../modules/fund/fund.controller', ['ensureEventCostRecipientColumns']],
    ['notifications', '../utils/notifications', ['ensureNotificationSchema']],
    ['media', '../utils/media', ['ensureMediaAccessKeyColumn']],
    ['tree edit keys', '../utils/treeEditPermissions', ['ensureMemberTreeEditKeysTable']],
    ['tree layout', '../utils/treeLayoutSettings', ['ensureTreeLayoutSettingsTable', 'ensureClanTreeStyleColumn']],
    ['account people', '../../modules/me/me.controller', ['ensureAccountPeopleTable']],
    ['people layout', '../../modules/genealogy/familyRelation.service', ['ensurePeopleTreeLayoutColumns', 'ensureFamilyRelationshipColumns']],
    ['genealogy', '../../modules/genealogy/genealogySchema.service', ['ensureGenealogySchema']],
    ['duplicate dismissals', '../../modules/genealogy/duplicates.service', ['ensureDuplicateDismissalsTable']],
    ['chatbot feedback', '../../modules/chatbot/chatbotFeedbackService', ['ensureChatbotFeedbackSchema', 'ensureChatbotHiddenSchema']],
    ['voice', '../../../../voice/backend/backendRoutes', ['ensureVoiceSchema']],
];

async function runAllSchemaEnsures({ log = console.log } = {}) {
    const results = [];
    for (const [label, modulePath, functionNames] of STEPS) {
        let mod;
        try {
            mod = require(path.join(__dirname, modulePath));
        } catch (error) {
            results.push({ label, ok: false, error: `không nạp được module: ${error.message}` });
            log(`✖ ${label}: không nạp được module (${error.message})`);
            continue;
        }

        for (const functionName of functionNames) {
            const name = `${label} · ${functionName}`;
            if (typeof mod[functionName] !== 'function') {
                results.push({ label: name, ok: false, error: 'hàm không được export' });
                log(`✖ ${name}: hàm không được export`);
                continue;
            }
            try {
                await mod[functionName]();
                results.push({ label: name, ok: true });
                log(`✔ ${name}`);
            } catch (error) {
                results.push({ label: name, ok: false, error: error.message });
                log(`✖ ${name}: ${error.message}`);
            }
        }
    }
    return results;
}

module.exports = { STEPS, runAllSchemaEnsures };
