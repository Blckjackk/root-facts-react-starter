import { TONE_CONFIG } from '../utils/config.js';
import { FALLBACK_FACTS } from '../utils/fallbackFacts.js';

export class RootFactsService {
  constructor() {
    this.generator = null;
    this.isModelLoaded = false;
    this.isGenerating = false;
    this.config = {
      modelName: 'Xenova/LaMini-Flan-T5-77M',
      cdnUrl: 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1',
      maxTokens: 50, // Optimized limit for faster inference
      temperature: 0.3,
      topP: 0.8,
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
          dtype: 'q4',
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
            dtype: 'q4',
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
        // Formulate prompt based on selected persona
        let prompt = '';
        // Reduce temperature as attempts fail to encourage more deterministic and correct outputs
        const temp = attempts === 3 ? 0.3 : (attempts === 2 ? 0.1 : 0.0);

        switch (this.currentTone) {
        case 'funny':
          prompt = `Generate one short and funny humor fact specifically about the vegetable ${sanitizedName}. The funny fact must be directly related to ${sanitizedName} and must not mention or describe any other object, person, place, or unrelated topic. Output only the funny fact.`;
          break;
        case 'professional':
          prompt = `Generate one short, professional, and scientific fact specifically about the vegetable ${sanitizedName}. The scientific fact must be directly related to ${sanitizedName} and must not mention or describe any other object, person, place, or unrelated topic. Output only the professional fact.`;
          break;
        case 'casual':
          prompt = `Generate one short, casual, and interesting culinary fact specifically about the vegetable ${sanitizedName}. The casual fact must be directly related to ${sanitizedName} and must not mention or describe any other object, person, place, or unrelated topic. Output only the casual fact.`;
          break;
        case 'normal':
        default:
          prompt = `Generate one short and interesting fun fact specifically about the vegetable ${sanitizedName}. The fun fact must be directly related to ${sanitizedName} and must not mention or describe any other object, person, place, or unrelated topic. Output only the fun fact.`;
          break;
        }

        const result = await this.generator(prompt, {
          max_new_tokens: this.config.maxTokens,
          temperature: temp,
          top_p: 0.8,
          do_sample: temp > 0,
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

  // Validate that the generated text is relevant to the detected vegetable
  validateFact(text, vegetableName) {
    if (!text || text.trim().length < 10) {
      return false;
    }
    const lowerText = text.toLowerCase();
    const lowerName = vegetableName.toLowerCase();

    // Check if the generated text just repeats the prompt instruction template
    if (lowerText.includes('generate one short') || lowerText.includes('specifically about') || lowerText.includes('must not mention')) {
      return false;
    }

    // Must mention the vegetable or its common singular/plural variants
    if (lowerText.includes(lowerName)) {
      return true;
    }

    if (lowerName === 'peas' && lowerText.includes('pea')) {
      return true;
    }
    if (lowerName === 'eggplant' && lowerText.includes('aubergine')) {
      return true;
    }
    if (lowerName === 'potato' && lowerText.includes('potatoes')) {
      return true;
    }
    if (lowerName === 'carrot' && lowerText.includes('carrots')) {
      return true;
    }
    if (lowerName === 'onion' && lowerText.includes('onions')) {
      return true;
    }
    if (lowerName === 'chilli' && lowerText.includes('chili')) {
      return true;
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

