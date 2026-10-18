import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import gsap from 'gsap';
import { initialState, reducer, walkthrough, type Action } from './state';

export function useExperience(reduced: boolean) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const nextStep = useRef(0);
  const routeTween = useRef<gsap.core.Tween | null>(null);
  const manual = useCallback((action: Action) => {
    dispatch({ type: 'WALK_PAUSE' });
    dispatch(action);
  }, []);

  useEffect(() => {
    if (state.recognition !== 'scanning' || !state.selected) return;
    const id = state.selected;
    const timer = setTimeout(() => dispatch({ type: 'RECOGNIZED', id }), reduced ? 0 : 750);
    return () => clearTimeout(timer);
  }, [state.recognition, state.selected, reduced]);

  useEffect(() => {
    if (!state.adding) return;
    const timer = setTimeout(() => dispatch({ type: 'ADDED' }), 650);
    return () => clearTimeout(timer);
  }, [state.adding]);

  useEffect(() => {
    if (state.phase !== 'navigating') return;
    const route = { p: 0 };
    routeTween.current = gsap.to(route, {
      p: 1, duration: reduced ? .01 : 3.8, ease: 'power2.inOut',
      onUpdate: () => dispatch({ type: 'ROUTE', value: route.p }),
      onComplete: () => dispatch({ type: 'ARRIVE' }),
    });
    return () => { routeTween.current?.kill(); routeTween.current = null; };
  }, [state.phase, state.destination, state.routeFrom, reduced]);

  useEffect(() => {
    if (!state.routeGuided) { routeTween.current?.resume(); return; }
    if (state.walk === 'paused') routeTween.current?.pause();
    else routeTween.current?.resume();
  }, [state.walk, state.routeGuided]);

  useEffect(() => {
    if (state.walk !== 'playing') return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      elapsedRef.current += (now - last) / 1000;
      last = now;
      setElapsed(elapsedRef.current);
      while (nextStep.current < walkthrough.length && elapsedRef.current >= walkthrough[nextStep.current].at) {
        const index = nextStep.current++;
        dispatch(walkthrough[index].action);
        dispatch({ type: 'WALK_STEP', step: index });
      }
      if (elapsedRef.current >= 58) dispatch({ type: 'WALK_DONE' });
    }, 100);
    return () => clearInterval(timer);
  }, [state.walk]);

  useEffect(() => {
    const onHidden = () => { if (document.hidden) dispatch({ type: 'WALK_PAUSE' }); };
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, []);

  const startWalkthrough = useCallback(() => {
    elapsedRef.current = 0; nextStep.current = 0; setElapsed(0);
    dispatch({ type: 'WALK_START' });
  }, []);
  const reset = useCallback(() => {
    elapsedRef.current = 0; nextStep.current = 0; setElapsed(0);
    dispatch({ type: 'RESET' });
  }, []);
  return { state, dispatch, manual, elapsed, startWalkthrough, reset };
}
