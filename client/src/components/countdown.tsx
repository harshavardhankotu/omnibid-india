import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface CountdownProps {
  endsAt: string;
  className?: string;
  large?: boolean;
  expiredText?: string;
  onExpire?: () => void;
}

export function Countdown({
  endsAt,
  className,
  large,
  expiredText = "Expired",
  onExpire,
}: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(endsAt));
  const onExpireRef = useRef(onExpire);
  const hasFiredExpireRef = useRef(false);

  onExpireRef.current = onExpire;

  useEffect(() => {
    hasFiredExpireRef.current = false;
    const sync = () => {
      const next = getTimeLeft(endsAt);
      setTimeLeft(next);
      if (next.expired && !hasFiredExpireRef.current) {
        hasFiredExpireRef.current = true;
        onExpireRef.current?.();
      }
      return next.expired;
    };

    if (sync()) return;

    const interval = window.setInterval(() => {
      if (sync()) {
        window.clearInterval(interval);
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [endsAt]);

  if (timeLeft.expired) {
    return (
      <span
        className={cn("text-muted-foreground font-mono font-semibold", large ? "text-lg" : "text-xs", className)}
        data-testid="countdown-expired"
      >
        {expiredText}
      </span>
    );
  }

  const isUrgent = timeLeft.totalSeconds < 3600;
  const days = Math.floor(timeLeft.hours / 24);
  const remHours = timeLeft.hours % 24;

  return (
    <span
      className={cn(
        "font-mono font-bold tabular-nums",
        large ? "text-2xl" : "text-xs",
        isUrgent ? "text-destructive" : "text-foreground",
        className
      )}
      data-testid="countdown-timer"
    >
      {days > 0 ? `${days}d ${pad(remHours)}:` : timeLeft.hours > 0 ? `${pad(timeLeft.hours)}:` : ""}
      {pad(timeLeft.minutes)}:{pad(timeLeft.seconds)}
      {timeLeft.hours === 0 && timeLeft.minutes === 0 && (
        <span className="ml-1 text-destructive animate-pulse">!</span>
      )}
    </span>
  );
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function getTimeLeft(endsAt: string) {
  const endMs = new Date(endsAt).getTime();
  const diff = Number.isNaN(endMs) ? 0 : endMs - Date.now();
  if (diff <= 0) return { expired: true, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 };
  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { expired: false, hours, minutes, seconds, totalSeconds };
}
