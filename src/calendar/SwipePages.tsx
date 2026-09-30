import { useLayoutEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, PanResponder, StyleSheet, type PanResponderGestureState } from 'react-native';

/** A swipe turns the page once it has gone this share of the width… */
const TURN_SHARE = 0.25;
/** …or was flicked at least this fast (points per millisecond). */
const TURN_SPEED = 0.4;
/** Sideways travel before the swipe takes the touch from the grid (and its taps and scrolling). */
const CLAIM_PX = 12;

interface Props {
  /** Names the page shown; the new page slides in when it changes. */
  page: string;
  onPrev(): void;
  onNext(): void;
  children: ReactNode;
}

const sideways = (g: PanResponderGestureState) => Math.abs(g.dx) > CLAIM_PX && Math.abs(g.dx) > Math.abs(g.dy) * 1.5;

/**
 * Turns the calendar's pages by swiping, like a book: the page follows the finger,
 * and a swipe right to left brings the next day, week or month, left to right the previous one.
 * Vertical scrolling, pull-to-refresh and taps inside are left alone.
 */
export function SwipePages({ page, onPrev, onNext, children }: Props) {
  const [pages] = useState(pager);
  useLayoutEffect(() => pages.follow(onPrev, onNext));
  // The new page comes in from the side the finger came from.
  useLayoutEffect(() => pages.arrive(), [page, pages]);

  return (
    <Animated.View
      style={[styles.pages, { transform: [{ translateX: pages.x }] }]}
      onLayout={(e) => pages.measure(e.nativeEvent.layout.width)}
      {...pages.responder.panHandlers}
    >
      {children}
    </Animated.View>
  );
}

/** The swipe's moving parts, kept for as long as the calendar is shown. */
function pager() {
  const x = new Animated.Value(0);
  let width = 0;
  /** Which way the page is leaving (-1: to the left, next; 1: to the right, previous) until the new one has slid in. */
  let turning: -1 | 1 | null = null;
  let turn = { onPrev: () => {}, onNext: () => {} };

  const back = () => Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
  const responder = PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => turning === null && width > 0 && sideways(g),
    onPanResponderMove: (_, g) => x.setValue(g.dx),
    onPanResponderTerminationRequest: () => false,
    onPanResponderRelease: (_, g) => {
      const far = Math.abs(g.dx) > width * TURN_SHARE;
      const fast = Math.abs(g.vx) > TURN_SPEED && Math.sign(g.vx) === Math.sign(g.dx);
      if (!far && !fast) return back();
      const dir = g.dx < 0 ? -1 : 1;
      turning = dir;
      Animated.timing(x, { toValue: dir * width, duration: 140, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() =>
        dir < 0 ? turn.onNext() : turn.onPrev(),
      );
    },
    onPanResponderTerminate: back,
  });

  return {
    x,
    responder,
    measure: (w: number) => (width = w),
    follow: (onPrev: () => void, onNext: () => void) => {
      turn = { onPrev, onNext };
    },
    arrive: () => {
      const dir = turning;
      if (dir === null) return;
      x.setValue(-dir * width);
      Animated.timing(x, { toValue: 0, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
        turning = null;
      });
    },
  };
}

const styles = StyleSheet.create({
  pages: { flex: 1 },
});
