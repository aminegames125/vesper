import type { TvIcon } from "@animateicons/react/lucide";
import { type ButtonHTMLAttributes, useRef } from "react";

export {
  ArrowLeftIcon,
  CalendarDaysIcon,
  CalendarPlusIcon,
  CaptionsIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleDotIcon,
  CircleStopIcon,
  ClapperboardIcon,
  ClockIcon,
  DownloadIcon,
  FastForwardIcon,
  FilmIcon,
  FolderOpenIcon,
  HeartIcon,
  HistoryIcon,
  HouseIcon,
  InfoIcon,
  LayoutGridIcon,
  ListIcon,
  MaximizeIcon,
  MinimizeIcon,
  MonitorIcon,
  MoonIcon,
  PauseIcon,
  PictureInPictureIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  RewindIcon,
  SearchIcon,
  ServerIcon,
  SettingsIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SlidersHorizontalIcon,
  StarIcon,
  SunIcon,
  TrashIcon,
  TvIcon,
  Volume2Icon,
  VolumeOffIcon,
  XIcon,
} from "@animateicons/react/lucide";

/** Any of the animated icons; they all share the same props and handle. */
export type AnimIcon = typeof TvIcon;

interface Handle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

/** Wires a parent's hover and focus to its icon, so the whole button plays the animation. */
export function useIconHover() {
  const ref = useRef<Handle>(null);
  return {
    ref,
    handlers: {
      onMouseEnter: () => ref.current?.startAnimation(),
      onMouseLeave: () => ref.current?.stopAnimation(),
      onFocus: () => ref.current?.startAnimation(),
      onBlur: () => ref.current?.stopAnimation(),
    },
  };
}

/** A round icon-only button. `label` is required so every control has an accessible name. */
export function IconButton({
  icon: Icon,
  label,
  size = 20,
  active,
  className = "",
  ...rest
}: {
  icon: AnimIcon;
  label: string;
  size?: number;
  active?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  const { ref, handlers } = useIconHover();
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      {...handlers}
      {...rest}
      className={`fade flex size-10 flex-none items-center justify-center rounded-full hover:bg-raised aria-pressed:text-accent ${className}`}
    >
      <Icon ref={ref} size={size} color="currentColor" />
    </button>
  );
}
