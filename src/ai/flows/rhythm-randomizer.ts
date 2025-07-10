'use server';

/**
 * @fileOverview This file defines a Genkit flow for adding subtle variations to rhythm patterns using AI.
 *
 * - rhythmRandomizer - A function that takes a rhythm pattern as input and returns a subtly altered version.
 * - RhythmRandomizerInput - The input type for the rhythmRandomizer function.
 * - RhythmRandomizerOutput - The return type for the rhythmRandomizer function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const RhythmRandomizerInputSchema = z.object({
  pattern: z
    .array(z.array(z.boolean()))
    .describe(
      'A 2D array representing the rhythm pattern. Each inner array represents a drum sound, and each boolean represents whether that step is active (true) or inactive (false).'
    ),
});
export type RhythmRandomizerInput = z.infer<typeof RhythmRandomizerInputSchema>;

const RhythmRandomizerOutputSchema = z.object({
  modifiedPattern: z
    .array(z.array(z.boolean()))
    .describe(
      'A 2D array representing the modified rhythm pattern.  The structure is identical to the input pattern.'
    ),
});
export type RhythmRandomizerOutput = z.infer<typeof RhythmRandomizerOutputSchema>;

export async function rhythmRandomizer(input: RhythmRandomizerInput): Promise<RhythmRandomizerOutput> {
  return rhythmRandomizerFlow(input);
}

const prompt = ai.definePrompt({
  name: 'rhythmRandomizerPrompt',
  input: {schema: RhythmRandomizerInputSchema},
  output: {schema: RhythmRandomizerOutputSchema},
  prompt: `You are a rhythm generator. Given the following rhythm pattern, add subtle variations to make it more interesting, without changing the overall feel too much.

IMPORTANT: You must only output a valid JSON 2D array of booleans that matches the input structure. Do not add any explanation, comments, or any other text.

Pattern:
{{{jsonStringify pattern}}}`,
});

const rhythmRandomizerFlow = ai.defineFlow(
  {
    name: 'rhythmRandomizerFlow',
    inputSchema: RhythmRandomizerInputSchema,
    outputSchema: RhythmRandomizerOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
