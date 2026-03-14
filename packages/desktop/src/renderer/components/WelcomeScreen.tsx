import { Bot} from 'lucide-react';


export function WelcomeScreen() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4">
      <div className="mb-8 flex flex-col items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
          <Bot className="h-8 w-8" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Qwen Code</h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            让我们开始吧!
          </p>
        </div>
      </div>
    </div>
  );
}
