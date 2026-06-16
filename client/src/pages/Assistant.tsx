import { Sparkles } from 'lucide-react';
import { Card } from '../components/ui';
import { AssistantChat } from '../components/Assistant';

export default function Assistant() {
  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2">
        <Sparkles className="text-accent" />
        <div>
          <h1 className="text-2xl font-semibold">My Finances · Assistant</h1>
          <p className="text-sm text-muted">Reasons over your live data. It interprets; the app does all the math.</p>
        </div>
      </div>
      <Card className="p-4 h-[70vh] flex flex-col">
        <AssistantChat />
      </Card>
    </div>
  );
}
