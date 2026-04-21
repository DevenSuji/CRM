import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { AIConfig } from '@/lib/types/config';

/**
 * Polish a free-text note for spelling/grammar using Gemini.
 * Returns { polished: string } on success; preserves the note's meaning and tone.
 *
 * Reads api_key + model from Firestore `crm_config/ai` (set in admin → AI Settings).
 * Falls back to GEMINI_API_KEY env var for local dev.
 */
export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }
    if (text.length > 4000) {
      return NextResponse.json({ error: 'Text too long (max 4000 chars).' }, { status: 400 });
    }

    const snap = await adminDb.collection('crm_config').doc('ai').get();
    const config = (snap.exists ? snap.data() : {}) as Partial<AIConfig>;
    console.log('[polish-note] Firestore read:', {
      doc_exists: snap.exists,
      project_id: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      enabled: config.enabled,
      api_key_length: config.api_key?.length || 0,
      api_key_prefix: config.api_key?.slice(0, 6) || '(empty)',
    });

    if (snap.exists && config.enabled === false) {
      return NextResponse.json(
        { error: 'AI Polish is disabled. Enable it in Admin → AI Settings.' },
        { status: 503 },
      );
    }

    const apiKey = config.api_key || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Gemini API key not configured. Add it in Admin → AI Settings.' },
        { status: 503 },
      );
    }

    const model = config.model || 'gemini-2.5-flash';

    const prompt = `You are polishing a CRM note written by a sales associate about a lead. Rephrase it into one or more clear, professional sentences that read naturally. Fix all spelling and grammar mistakes. Restructure fragmented thoughts into coherent prose, but preserve every observation, detail, and sentiment the associate expressed — do not invent facts, do not drop information, do not soften or amplify their assessment of the lead. Keep it concise and business-appropriate. Return only the polished note with no preamble, no quotes, no explanation.\n\nNOTE:\n${text}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
        }),
      },
    );
    if (!res.ok) {
      const errText = await res.text();
      console.error('Gemini polish error:', errText);
      return NextResponse.json({ error: 'Polish request failed.' }, { status: 502 });
    }
    const data = await res.json();
    const polished: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!polished) {
      return NextResponse.json({ error: 'No response from model.' }, { status: 502 });
    }
    return NextResponse.json({ polished: polished.trim() });
  } catch (err) {
    console.error('Polish note error:', err);
    return NextResponse.json({ error: 'Failed to polish note.' }, { status: 500 });
  }
}
