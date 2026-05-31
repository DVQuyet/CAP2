const intentParser = require('./intentParserService');
const { planChatbotQuery } = require('./aiChatbotClient');
const { validatePlannerOutput } = require('./plannerValidatorService');
const db = require('../../config/db');

function plannerMetadata(source, accepted, extra = {}) {
    return {
        source,
        accepted: Boolean(accepted),
        ...extra,
    };
}

async function auditPlanner({ userId, clanId, request, response, accepted, rejectionReason }) {
    try {
        await db.query(
            `
            INSERT INTO chatbot_ai_audit_logs
              (account_id, clan_id, purpose, request_json, response_json, accepted, rejection_reason)
            VALUES (?, ?, 'chatbot_plan', ?, ?, ?, ?)
            `,
            [
                Number(userId) || null,
                Number(clanId) || null,
                JSON.stringify(request || {}),
                JSON.stringify(response || {}),
                accepted ? 1 : 0,
                rejectionReason || null,
            ]
        );
    } catch (_) {
        // Audit logging must never block chatbot fallback behavior.
    }
}

async function planQuery({ message, memory, userId, clanId, currentMemberId } = {}) {
    const rulePlan = intentParser.parse(message);
    if (rulePlan.intent && rulePlan.intent !== 'unknown') {
        return {
            plan: rulePlan,
            planner: plannerMetadata('rule_parser', true),
        };
    }

    const aiRequest = {
        message,
        memory,
        context: {
            userId,
            clanId,
            currentMemberId,
        },
    };
    const aiResult = await planChatbotQuery(aiRequest);

    if (!aiResult.success) {
        await auditPlanner({
            userId,
            clanId,
            request: aiRequest,
            response: aiResult,
            accepted: false,
            rejectionReason: aiResult.code || 'ai_server_unavailable',
        });
        return {
            plan: rulePlan,
            planner: plannerMetadata('llm_planner', false, {
                fallback: 'rule_parser',
                reason: aiResult.code || 'ai_server_unavailable',
            }),
        };
    }

    const validated = validatePlannerOutput(aiResult.data);
    await auditPlanner({
        userId,
        clanId,
        request: aiRequest,
        response: aiResult.data,
        accepted: validated.ok,
        rejectionReason: validated.ok ? null : validated.reason,
    });

    if (!validated.ok) {
        return {
            plan: rulePlan,
            planner: plannerMetadata('llm_planner', false, {
                fallback: 'rule_parser',
                reason: validated.reason,
            }),
        };
    }

    return {
        plan: {
            intent: validated.plan.intent,
            confidence: validated.plan.confidence ?? Math.max(Number(rulePlan.confidence || 0), 0.5),
            entities: validated.plan.entities || {},
            ast: validated.plan.ast || null,
            expression: validated.plan.expression || null,
        },
        planner: plannerMetadata('llm_planner', true, {
            confidence: validated.plan.confidence ?? null,
        }),
    };
}

module.exports = {
    planQuery,
};
