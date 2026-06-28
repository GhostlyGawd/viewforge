import React from 'react'
import { Composition } from 'remotion'
import { MarginaliaVideo } from './MarginaliaVideo'
import motionPlan from '../../motion-plan.json'
import script from '../../script.json'

// Generic ViewForge composition root: duration + fps come from the motion plan, props
// are the plan + script the motion department produced. Brand-agnostic — the tokens in
// the plan drive the look, so this same template renders any channel's videos.
export const RemotionRoot: React.FC = () => (
  <Composition
    id="MarginaliaVideo"
    component={MarginaliaVideo as any}
    durationInFrames={motionPlan.durationFrames}
    fps={motionPlan.fps}
    width={1920}
    height={1080}
    defaultProps={{ motionPlan: motionPlan as any, script: script as any }}
  />
)
