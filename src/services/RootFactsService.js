import { TONE_CONFIG } from '../utils/config.js';
import { FALLBACK_FACTS } from '../utils/fallbackFacts.js';

export class RootFactsService {
  constructor() {
    this.generator = null;
    this.isModelLoaded = false;
    this.isGenerating = false;
    this.config = {
      modelName: 'Xenova/LaMini-Flan-T5-248M',
      cdnUrl: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1',
      maxTokens: 100, // Increased for more complete and relevant responses
      temperature: 0.7, // Higher temperature for varied, non-static results
      topP: 0.9,
    };
    this.currentBackend = 'cpu';
    this.currentTone = TONE_CONFIG.defaultTone;
  }

  // TODO [Basic] Muat model dan inisialisasi pipeline text2text-generation
  // TODO [Advance] Implementasikan strategi Backend Adaptive
  async loadModel(onProgress) {
    try {
      const { pipeline, env } = await import(this.config.cdnUrl);

      // Disable local models checking since we load via CDN
      env.allowLocalModels = false;

      // Check WebGPU capability
      let device = 'cpu';
      if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
        device = 'webgpu';
        this.currentBackend = 'webgpu';
      } else {
        this.currentBackend = 'cpu';
      }

      this.generator = await pipeline(
        'text2text-generation',
        this.config.modelName,
        {
          device: device,
          dtype: 'q8',
          progress_callback: (progress) => {
            if (onProgress) {
              onProgress(progress);
            }
          }
        }
      );

      this.isModelLoaded = true;
      return { success: true, model: this.config.modelName, device };
    } catch (error) {
      console.warn('Failed to load Transformers model on WebGPU, falling back to CPU:', error);
      try {
        const { pipeline } = await import(this.config.cdnUrl);
        this.generator = await pipeline(
          'text2text-generation',
          this.config.modelName,
          {
            device: 'cpu',
            dtype: 'q8',
            progress_callback: (progress) => {
              if (onProgress) {
                onProgress(progress);
              }
            }
          }
        );
        this.currentBackend = 'cpu';
        this.isModelLoaded = true;
        return { success: true, model: this.config.modelName, device: 'cpu' };
      } catch (fallbackError) {
        console.error('Error loading Transformers.js model:', fallbackError);
        throw fallbackError;
      }
    }
  }

  // TODO [Advance] Konfigurasi tone fakta yang dihasilkan
  setTone(tone) {
    this.currentTone = tone;
  }

  // TODO [Basic] Lakukan prediksi pada elemen gambar yang diberikan dan kembalikan hasilnya
  // TODO [Skilled] Konfigurasikan parameter generasi berdasarkan kebutuhan
  // TODO [Advance] Implemenasikan parameter tone untuk mengatur nada fakta yang dihasilkan
  async generateFacts(vegetableName) {
    if (!this.isModelLoaded || !this.generator) {
      throw new Error('Generative AI model is not loaded');
    }

    this.isGenerating = true;

    try {
      // Clean name to prevent prompt injection
      const sanitizedName = vegetableName
        .replace(/[|]{2,}/g, '')
        .replace(/[#=]{2,}/g, '')
        .replace(/(--|\+\+|``)/g, '')
        .replace(/\n/g, ' ')
        .trim();

      let attempts = 3;
      let generatedText = '';
      let isValid = false;

      while (attempts > 0 && !isValid) {
        // Vary temperature across retries: start high for variety, go lower for reliability
        const temp = attempts === 3 ? 0.75 : (attempts === 2 ? 0.5 : 0.2);
        const tone = this.currentTone || 'normal';

        // Incorporate context about vegetables/health/cooking to guide the model to be more relevant and creative
        let prompt = '';
        if (tone === 'funny') {
          prompt = `Describe vegetable ${sanitizedName} in funny way with one sentence focusing on a hilarious joke or funny fact.`;
        } else if (tone === 'professional') {
          prompt = `Describe vegetable ${sanitizedName} in professional way with one sentence focusing on its nutritional values, health benefits, or scientific properties.`;
        } else if (tone === 'casual') {
          prompt = `Describe vegetable ${sanitizedName} in casual way with one sentence focusing on its culinary uses, taste, and cooking.`;
        } else {
          prompt = `Describe vegetable ${sanitizedName} in normal way with one sentence focusing on an interesting history or unique fact.`;
        }

        const result = await this.generator(prompt, {
          max_new_tokens: this.config.maxTokens,
          temperature: temp,
          top_p: this.config.topP,
          do_sample: temp > 0,
          repetition_penalty: 1.6, // Prevents repetitive/looping sentences
          no_repeat_ngram_size: 3, // Prevents repetitive 3-word combinations
        });

        generatedText = result[0].generated_text.trim();
        isValid = this.validateFact(generatedText, sanitizedName);
        attempts--;
      }

      if (isValid) {
        return generatedText;
      }

      console.warn(`Generated fact was invalid/unrelated for "${sanitizedName}". Using high-quality fallback fact.`);
      return this.getFallbackFact(sanitizedName, this.currentTone);
    } catch (error) {
      console.error('Error generating fact:', error);
      return this.getFallbackFact(vegetableName, this.currentTone);
    } finally {
      this.isGenerating = false;
    }
  }

  // Validate that the generated text is relevant and high-quality for the detected vegetable
  validateFact(text, vegetableName) {
    if (!text || text.trim().length < 20) {
      return false;
    }
    const lowerText = text.toLowerCase();
    const lowerName = vegetableName.toLowerCase();

    // === REJECT PATTERNS ===

    // 1. Reject prompt echoing
    const promptPatterns = ['generate one', 'specifically about', 'must not mention', 'describe vegetable', 'output only'];
    for (const p of promptPatterns) {
      if (lowerText.includes(p)) return false;
    }

    // 2. Reject gibberish: repeating character sequences (e.g. "OSOSOSOS", "aaaaa")
    if (/(.{2,})\1{2,}/i.test(text)) {
      return false;
    }

    // 3. Reject repetitive words: any meaningful word repeated 3+ times
    const words = lowerText.split(/\s+/);
    const wordCounts = {};
    for (const word of words) {
      if (word.length > 2) {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
        if (wordCounts[word] >= 3) return false;
      }
    }

    // 4. Reject too short (less than 8 words)
    if (words.length < 8) {
      return false;
    }

    // 5. Reject generic template patterns seen from bad model output
    const genericPatterns = [
      'is a vegetable',
      'is a popular',
      'popular choice',
      'popular snack',
      'popular vegetable',
      'people to enjoy',
      'especially when',
      'cooked in a pot',
      'all over the',
      'all around the',
      'all of the',
      'fresh air and enjoy',
      'is the body of water',
      'body of water',
    ];
    for (const gp of genericPatterns) {
      if (lowerText.includes(gp)) return false;
    }

    // 6. Reject content clearly unrelated to vegetables/food/agriculture
    const unrelatedKeywords = [
      'anatomy', 'manusia', 'human body', 'programming', 'software',
      'computer', 'javascript', 'politik', 'ocean', 'the sea',
      'president', 'government', 'military', 'war ', 'planet',
      'spacecraft', 'galaxy', 'solar system', 'mathematics',
    ];
    for (const keyword of unrelatedKeywords) {
      if (lowerText.includes(keyword)) return false;
    }

    // 7. Reject if it mentions a DIFFERENT food/vegetable as the subject
    //    (e.g. "An apple is used in garlic" — apple is not garlic)
    const otherFoods = ['apple', 'banana', 'orange', 'grape', 'mango', 'strawberry', 'watermelon', 'pineapple', 'cherry', 'peach', 'lemon'];
    for (const food of otherFoods) {
      // Only reject if the other food appears as a subject (near start of sentence)
      if (lowerText.startsWith(food) || lowerText.startsWith(`an ${food}`) || lowerText.startsWith(`a ${food}`) || lowerText.startsWith(`the ${food}`)) {
        if (!lowerName.includes(food)) return false;
      }
    }

    // === ACCEPT CONDITIONS ===

    // Must mention the vegetable name or a known variant
    const nameVariants = [lowerName];
    if (lowerName.endsWith('s')) {
      nameVariants.push(lowerName.slice(0, -1));
    } else {
      nameVariants.push(`${lowerName}s`);
    }
    const aliases = {
      eggplant: ['aubergine'],
      chilli: ['chili', 'chilli pepper', 'chili pepper'],
      corn: ['maize'],
      potato: ['potatoes'],
      peas: ['pea', 'green pea'],
      cabbage: ['cabbages'],
      lettuce: ['salad green'],
      spinach: ['spinacia'],
      garlic: ['allium'],
      ginger: ['zingiber'],
      onion: ['onions', 'allium cepa'],
    };
    if (aliases[lowerName]) {
      nameVariants.push(...aliases[lowerName]);
    }

    for (const variant of nameVariants) {
      if (lowerText.includes(variant)) {
        return true;
      }
    }

    return false;
  }

  // Get pre-defined high-quality fallback fact matching tone and vegetable
  getFallbackFact(vegetableName, tone) {
    const key = vegetableName.toLowerCase().trim();
    const selectedTone = tone || 'normal';
    const factGroup = FALLBACK_FACTS[key];

    if (!factGroup) {
      return `The vegetable ${vegetableName} is a healthy choice and offers great nutritional values.`;
    }

    return factGroup[selectedTone] || factGroup['normal'];
  }

  // TODO [Basic] Periksa apakah model sudah dimuat dan siap digunakan
  isReady() {
    return this.isModelLoaded && !this.isGenerating;
  }
}

