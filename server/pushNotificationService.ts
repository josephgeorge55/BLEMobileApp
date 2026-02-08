interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: string;
  badge?: number;
  channelId?: string;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

export async function sendExpoPushNotifications(tokens: string[], title: string, body: string, data?: Record<string, unknown>): Promise<{ sent: number; failed: number }> {
  const validTokens = tokens.filter(t => t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['));
  
  if (validTokens.length === 0) return { sent: 0, failed: 0 };

  const messages: ExpoPushMessage[] = validTokens.map(token => ({
    to: token,
    title,
    body,
    sound: 'default',
    data: data || {},
  }));

  const BATCH_SIZE = 100;
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      });

      const result = await response.json();
      const tickets: ExpoPushTicket[] = result.data || [];
      
      for (const ticket of tickets) {
        if (ticket.status === 'ok') {
          sent++;
        } else {
          failed++;
          console.error('[Push] Failed ticket:', ticket.message, ticket.details);
        }
      }
    } catch (error) {
      console.error('[Push] Batch send error:', error);
      failed += batch.length;
    }
  }

  console.log(`[Push] Sent: ${sent}, Failed: ${failed}`);
  return { sent, failed };
}
