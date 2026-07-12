import React from 'react'
import { Composition } from 'remotion'
import { MarginaliaVideo } from './MarginaliaVideo'
import { CaptionVideo } from './CaptionVideo'
import { StoryVideo, STORY_STING_SEC } from './StoryVideo'
import motionPlan from '../../motion-plan.json'
import script from '../../script.json'
import captions from '../../captions.json'

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="MarginaliaVideo"
      component={MarginaliaVideo as any}
      durationInFrames={motionPlan.durationFrames}
      fps={motionPlan.fps}
      width={1920}
      height={1080}
      defaultProps={{ motionPlan: motionPlan as any, script: script as any, audioFile: (motionPlan as any).audioFile ?? null }}
    />
    {/* Audio-driven, word-synced caption cut */}
    <Composition
      id="CaptionVideo"
      component={CaptionVideo as any}
      durationInFrames={Math.round((captions as any).totalSec * motionPlan.fps)}
      fps={motionPlan.fps}
      width={1920}
      height={1080}
      defaultProps={{ captions: captions as any, plan: motionPlan as any }}
    />
    {/* The COMPOSED cut: per-beat scene grammar (params.sceneType) + intra-beat photo
        cuts + voice-synced kinetic type + the set-piece library. Prefer this one. */}
    <Composition
      id="StoryVideo"
      component={StoryVideo as any}
      durationInFrames={Math.round(((captions as any).totalSec + STORY_STING_SEC + 0.5) * motionPlan.fps)}
      fps={motionPlan.fps}
      width={1920}
      height={1080}
      defaultProps={{ captions: captions as any, plan: motionPlan as any }}
    />
  </>
)
