/**
 * Speech-to-text with Deepgram (nova-3, multilingual: handles French, English and code-switching).
 * Swap this file to use another provider; the rest of the pipeline only needs the transcript.
 */
export async function transcribe(audio: Uint8Array<ArrayBuffer>, mimeType: string, apiKey: string): Promise<string> {
  const url = 'https://api.deepgram.com/v1/listen?model=nova-3&language=multi&smart_format=true&punctuate=true';
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Token ${apiKey}`, 'Content-Type': mimeType || 'audio/m4a' },
    body: audio,
  });
  if (!res.ok) throw new Error(`Transcription failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return (data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '').trim();
}
