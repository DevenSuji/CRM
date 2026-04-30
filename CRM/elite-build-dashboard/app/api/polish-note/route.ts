import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/api/rateLimit';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { AIConfig } from '@/lib/types/config';
import { ApiValidationError, readJsonObject, requiredString } from '@/lib/api/validation';

function extractGeminiError(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    const message = parsed?.error?.message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  } catch {
    // Fall through to the raw response below.
  }
  return raw.trim();
}

const POLISH_NOTE_ALLOWED_ROLES = new Set(['superadmin', 'admin', 'sales_exec']);

/**
 * Polish a free-text note for spelling/grammar using Gemini.
 * Returns { polished: string } on success; preserves the note's meaning and tone.
 *
 * Reads non-secret settings from Firestore `crm_config/ai`.
 * Reads the Gemini credential only from the server-side GEMINI_API_KEY env var.
 */
export async function POST(req: NextRequest) {
  try {
    const idToken = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
    if (!idToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(idToken);
    const userSnap = await adminDb.collection('users').doc(decoded.uid).get();
    const user = userSnap.data();
    if (user?.active !== true) {
      return NextResponse.json({ error: 'Active CRM user required.' }, { status: 403 });
    }
    if (!POLISH_NOTE_ALLOWED_ROLES.has(String(user.role || ''))) {
      return NextResponse.json({ error: 'Lead note access required.' }, { status: 403 });
    }
    const limited = enforceRateLimit(req, 'polish-note', { actorUid: decoded.uid, limit: 20, windowMs: 60_000 });
    if (limited) return limited;

    const payload = await readJsonObject(req, 8_192);
    const text = requiredString(payload, 'text', { max: 4000 });

    const snap = await adminDb.collection('crm_config').doc('ai').get();
    const config = (snap.exists ? snap.data() : {}) as Partial<AIConfig>;
    if (snap.exists && config.enabled === false) {
      return NextResponse.json(
        { error: 'AI Polish is disabled. Enable it in Admin → AI Settings.' },
        { status: 503 },
      );
    }

    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Gemini API key not configured on the server. Set GEMINI_API_KEY in the deployment environment.' },
        { status: 503 },
      );
    }

    const model = (config.model || 'gemini-2.5-flash').trim();

    const prompt = `You are polishing a CRM note written by a sales associate about a lead. Rephrase it into one or more clear, professional sentences that read naturally. Fix all spelling and grammar mistakes. Restructure fragmented thoughts into coherent prose, but preserve every observation, detail, and sentiment the associate expressed — do not invent facts, do not drop information, do not soften or amplify their assessment of the lead. Keep it concise and business-appropriate. Return only the polished note with no preamble, no quotes, no explanation.\n\nNOTE:\n${text}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
        }),
      },
    );
    if (!res.ok) {
      const errText = await res.text();
      const geminiMessage = extractGeminiError(errText);
      console.error('Gemini polish error:', { status: res.status, message: geminiMessage });
      return NextResponse.json(
        { error: `Gemini request failed (${res.status}): ${geminiMessage || 'Unknown error'}` },
        { status: 502 },
      );
    }
    const data = await res.json();
    const polished: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!polished) {
      return NextResponse.json({ error: 'No response from model.' }, { status: 502 });
    }
    return NextResponse.json({ polished: polished.trim() });
  } catch (err) {
    if (err instanceof ApiValidationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('Polish note error:', err);
    return NextResponse.json({ error: 'Failed to polish note.' }, { status: 500 });
  }
}
