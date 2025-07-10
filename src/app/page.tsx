
'use client';

import { rhythmRandomizer } from '@/ai/flows/rhythm-randomizer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Loader2, Play, Pause, RotateCcw, Sparkles } from 'lucide-react';
import React, { useState, useEffect, useRef, useCallback } from 'react';

const NUM_STEPS = 16;

const DRUM_KIT = {
  name: '808',
  sounds: [
    { name: 'Kick', path: '/audio/808/kick.mp3' },
    { name: 'Snare', path: '/audio/808/snare.mp3' },
    { name: 'Clap', path: '/audio/808/clap.mp3' },
    { name: 'Hat Closed', path: '/audio/808/hhc.mp3' },
    { name: 'Hat Open', path: '/audio/808/hho.mp3' },
    { name: 'Tom', path: '/audio/808/tom.mp3' },
  ],
};

const initialPattern = Array(DRUM_KIT.sounds.length).fill(Array(NUM_STEPS).fill(false));

export default function DrumMachinePage() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [tempo, setTempo] = useState(120);
  const [pattern, setPattern] = useState<boolean[][]>(initialPattern);
  const [volumes, setVolumes] = useState<number[]>(Array(DRUM_KIT.sounds.length).fill(80));
  const [currentStep, setCurrentStep] = useState(-1);
  const [audioBuffers, setAudioBuffers] = useState<(AudioBuffer | null)[]>([]);
  const [isRandomizing, setIsRandomizing] = useState(false);
  const [isKitLoading, setIsKitLoading] = useState(true);

  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodesRef = useRef<GainNode[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();
  
  const createFallbackBuffer = (context: AudioContext) => {
    const frameCount = context.sampleRate * 0.1; // 100ms
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
        // A simple decaying noise to create a click sound
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (context.sampleRate * 0.01));
    }
    return buffer;
  }

  const loadAudioKit = useCallback(async (context: AudioContext) => {
    setIsKitLoading(true);
    try {
      gainNodesRef.current = DRUM_KIT.sounds.map(() => context.createGain());
      gainNodesRef.current.forEach((gainNode, index) => {
        gainNode.gain.value = volumes[index] / 100;
        gainNode.connect(context.destination);
      });
      
      const fallbackBuffer = createFallbackBuffer(context);

      const decodedBuffers = await Promise.all(
        DRUM_KIT.sounds.map(sound =>
          fetch(sound.path)
            .then(response => {
              if (!response.ok) throw new Error(`Sound file not found: ${sound.path}`);
              return response.arrayBuffer();
            })
            .then(buffer => context.decodeAudioData(buffer))
            .catch(err => {
              console.warn(`Could not load sound: ${sound.path}. Using fallback. This is expected if sound files are not present in /public${sound.path}.`);
              return fallbackBuffer;
            })
        )
      );
      setAudioBuffers(decodedBuffers);
    } catch (error) {
      console.error("Failed to initialize audio kit:", error);
      toast({
        variant: "destructive",
        title: "Audio Error",
        description: "Could not load the sound kit.",
      });
    } finally {
      setIsKitLoading(false);
    }
  }, [volumes, toast]);
  
  const playSample = useCallback((soundIndex: number) => {
    const context = audioContextRef.current;
    const buffer = audioBuffers[soundIndex];
    const gainNode = gainNodesRef.current[soundIndex];

    if (context && buffer && gainNode && context.state === 'running') {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(gainNode);
      source.start(0);
    }
  }, [audioBuffers]);

  useEffect(() => {
    if (isPlaying && !isKitLoading) {
      intervalRef.current = setInterval(() => {
        setCurrentStep(prevStep => {
          const nextStep = (prevStep + 1) % NUM_STEPS;
          pattern.forEach((track, soundIndex) => {
            if (track?.[nextStep]) {
              playSample(soundIndex);
            }
          });
          return nextStep;
        });
      }, (60 * 1000) / tempo / 4);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      setCurrentStep(-1);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, tempo, pattern, playSample, isKitLoading]);

  const handlePlayPause = async () => {
    let context = audioContextRef.current;

    if (!context) {
      try {
        context = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = context;
      } catch (error) {
        console.error("Failed to create audio context:", error);
        toast({
          variant: 'destructive',
          title: 'Audio Error',
          description: 'Could not initialize the audio engine. Your browser might not be supported.',
        });
        return;
      }
    }

    if (context.state === 'suspended') {
      await context.resume();
    }
    
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if(audioBuffers.length === 0) {
        await loadAudioKit(context);
      }
      setIsPlaying(true);
    }
  };

  const handleClear = () => {
    setPattern(initialPattern);
  };

  const handleRandomize = async () => {
    setIsRandomizing(true);
    try {
      const response = await rhythmRandomizer({ pattern });
      if (response && response.modifiedPattern && isPatternValid(response.modifiedPattern)) {
        setPattern(response.modifiedPattern);
        toast({ title: "Rhythm Randomized!", description: "The AI has cooked up a new beat." });
      } else {
         throw new Error("AI did not return a valid modified pattern.");
      }
    } catch (error) {
      console.error('Failed to randomize pattern:', error);
      toast({
        variant: 'destructive',
        title: 'Randomization Failed',
        description: 'Could not get a new pattern from the AI.',
      });
    } finally {
      setIsRandomizing(false);
    }
  };

  const toggleStep = (soundIndex: number, stepIndex: number) => {
    const newPattern = pattern.map(row => [...row]);
    newPattern[soundIndex][stepIndex] = !newPattern[soundIndex][stepIndex];
    setPattern(newPattern);
  };
  
  const handleVolumeChange = (soundIndex: number, value: number) => {
      const newVolumes = [...volumes];
      newVolumes[soundIndex] = value;
      setVolumes(newVolumes);
      if (gainNodesRef.current[soundIndex]) {
          gainNodesRef.current[soundIndex].gain.value = value / 100;
      }
  };

  const isPatternValid = (p: any): p is boolean[][] => {
    return Array.isArray(p) && p.length === DRUM_KIT.sounds.length && p.every(row => Array.isArray(row) && row.length === NUM_STEPS && row.every(val => typeof val === 'boolean'));
  }

  useEffect(() => {
    // We only want to create the audio context once the component is mounted in the browser.
    if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        loadAudioKit(audioContextRef.current);
    }
  }, [loadAudioKit]);


  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      <Card className="w-full max-w-7xl shadow-2xl border-2 border-primary/20">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-3xl md:text-4xl font-bold tracking-widest text-primary">
            Transistor Rhythms
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6 p-4 rounded-lg bg-muted/50 border border-border">
            <div className="lg:col-span-3 flex items-center justify-center lg:justify-start gap-2 md:gap-4">
              <Button onClick={handlePlayPause} disabled={isKitLoading} size="lg" className="w-28">
                {isKitLoading ? <Loader2 className="animate-spin" /> : isPlaying ? <><Pause className="mr-2"/> Stop</> : <><Play className="mr-2"/> Start</>}
              </Button>
              <Button onClick={handleClear} variant="secondary" size="lg"><RotateCcw className="mr-2"/> Clear</Button>
              <Button onClick={handleRandomize} variant="secondary" size="lg" disabled={isRandomizing}>
                {isRandomizing ? <Loader2 className="mr-2 animate-spin" /> : <Sparkles className="mr-2" />}
                Randomize
              </Button>
            </div>
            <div className="flex items-center gap-4">
              <label htmlFor="tempo" className="text-lg font-medium whitespace-nowrap">BPM</label>
              <Slider id="tempo" value={[tempo]} onValueChange={([val]) => setTempo(val)} min={40} max={240} step={1} className="w-full" />
              <span className="text-lg font-bold w-16 text-right text-accent">{tempo}</span>
            </div>
          </div>
          
          <div className="flex flex-col xl:flex-row gap-8">
            <div className="flex-grow overflow-x-auto">
              <div className="grid gap-y-2" style={{gridTemplateColumns: `10rem repeat(${NUM_STEPS}, 1fr)`}}>
                {/* Headers */}
                <div className="font-bold text-sm text-muted-foreground sticky left-0 z-10 bg-background/95 pr-2">Sound</div>
                {Array.from({ length: NUM_STEPS }, (_, i) => (
                  <div key={i} className={cn("text-center font-mono text-xs", (i+1) % 4 === 0 ? "text-foreground" : "text-muted-foreground")}>
                    {i + 1}
                  </div>
                ))}
                
                {/* Sequencer Grid */}
                {DRUM_KIT.sounds.map((sound, soundIndex) => (
                  <React.Fragment key={sound.name}>
                    <div className="font-bold text-sm text-left sticky left-0 z-10 bg-background/95 pr-2 flex items-center">{sound.name}</div>
                    {Array.from({ length: NUM_STEPS }).map((_, stepIndex) => {
                       const isActive = pattern?.[soundIndex]?.[stepIndex] ?? false;
                       return (
                          <div key={stepIndex} className={cn("flex items-center justify-center", stepIndex === currentStep && isPlaying ? "bg-primary/20 rounded-md" : "")}>
                            <button
                              onClick={() => toggleStep(soundIndex, stepIndex)}
                              aria-pressed={isActive}
                              className={cn(
                                "w-full h-12 md:h-14 rounded-md border-2 border-muted transition-all duration-150 transform hover:scale-105",
                                isActive ? 'bg-accent' : 'bg-muted/50 hover:bg-muted',
                                 (stepIndex + 1) % 4 === 0 ? "border-r-foreground/30" : ""
                              )}
                            />
                          </div>
                       );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Mixer */}
            <div className="xl:w-64 shrink-0">
               <h3 className="text-lg font-bold mb-4 text-center xl:text-left">Mixer</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-1 gap-4">
                  {DRUM_KIT.sounds.map((sound, soundIndex) => (
                     <div key={sound.name} className="flex flex-col items-center gap-2">
                       <label className="text-xs font-bold" htmlFor={`vol-${sound.name}`}>{sound.name}</label>
                       <div className="flex items-center gap-2 w-full">
                         <Slider 
                           id={`vol-${sound.name}`}
                           value={[volumes[soundIndex]]} 
                           onValueChange={([val]) => handleVolumeChange(soundIndex, val)}
                           min={0} 
                           max={100}
                           step={1}
                           className="w-full"
                         />
                         <span className="text-xs font-mono w-6 text-right">{volumes[soundIndex]}</span>
                       </div>
                     </div>
                  ))}
                </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
