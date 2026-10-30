// Approximate token count for text written into the repo. o200k_base is not the exact
// tokenizer of every model, so treat this as a +/-15% estimate; exact model usage
// comes from transcripts / OTel instead.
let encoder;

export async function countTokens(text) {
  if (!text) return 0;
  if (encoder === undefined) {
    try {
      const { Tiktoken } = await import('js-tiktoken/lite');
      const { default: ranks } = await import('js-tiktoken/ranks/o200k_base');
      encoder = new Tiktoken(ranks);
    } catch {
      encoder = null; // dependencies not installed yet
    }
  }
  return encoder ? encoder.encode(text, [], []).length : Math.ceil(text.length / 4);
}
