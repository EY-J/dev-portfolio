import type { HTMLAttributes } from "react";

type ContainerProps = HTMLAttributes<HTMLDivElement>;

export default function Container({ className, ...props }: ContainerProps) {
  return (
    <div
      className={["mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}
