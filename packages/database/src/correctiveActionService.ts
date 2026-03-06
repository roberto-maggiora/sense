import { prisma } from './index';

export async function createCorrectiveAction(input: {
    alert_id: string;
    client_id: string;
    action_text: string;
    created_by_user_id?: string | null;
}) {
    const trimmedText = input.action_text.trim();
    if (!trimmedText) {
        throw new Error('action_text cannot be empty');
    }
    if (trimmedText.length > 2000) {
        throw new Error('action_text cannot exceed 2000 characters');
    }

    return prisma.correctiveAction.create({
        data: {
            alert_id: input.alert_id,
            client_id: input.client_id,
            action_text: trimmedText,
            created_by_user_id: input.created_by_user_id || null,
        }
    });
}

export async function listCorrectiveActionsForAlert(clientId: string, alertId: string) {
    return prisma.correctiveAction.findMany({
        where: {
            alert_id: alertId,
            client_id: clientId,
        },
        orderBy: {
            created_at: 'asc',
        },
        include: {
            created_by_user: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                }
            }
        }
    });
}
