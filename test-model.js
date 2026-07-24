import { pipeline } from '@huggingface/transformers';

async function test() {
  console.log('Loading pipeline...');
  const generator = await pipeline('text2text-generation', 'Xenova/LaMini-Flan-T5-77M');

  const sanitizedName = 'eggplant';

  const prompts = {
    funny: `Tell a funny, humorous joke and fact about the vegetable ${sanitizedName} in English. Keep the topic focused on this vegetable and its health/cooking aspect. Keep it to 1 or 2 sentences.`,
    professional: `Provide a scientific, professional, and health-focused fact about the vegetable ${sanitizedName} in English. Focus on its nutritional values and health benefits. Keep it to 1 or 2 sentences.`,
    casual: `Give a friendly, cool, and interesting fact about the vegetable ${sanitizedName} in English. Focus on its culinary use, taste, or health benefits. Keep it to 1 or 2 sentences.`,
    normal: `Write a simple, interesting fun fact about the vegetable ${sanitizedName} in English. Focus on its health benefits or growth. Keep it to 1 or 2 sentences.`
  };

  for (const [tone, prompt] of Object.entries(prompts)) {
    console.log(`\n--- Testing tone: ${tone} ---`);
    console.log(`Prompt: "${prompt}"`);
    const result = await generator(prompt, {
      max_new_tokens: 150,
      temperature: 0.3,
      top_p: 0.8,
      do_sample: true,
    });
    console.log(`Output: "${result[0].generated_text.trim()}"`);
  }
}

test().catch(console.error);
