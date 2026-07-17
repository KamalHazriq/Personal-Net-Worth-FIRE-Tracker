import { Sparkles } from 'lucide-react';
import { Card, PageHeader } from '../components/ui';
import { AssistantChat } from '../components/Assistant';

export default function Assistant() {
  return (
    <div className="space-y-4 max-w-3xl">
      <PageHeader
        icon={Sparkles}
        title="My Finances · Assistant"
        subtitle="Reasons over your live data. It interprets; the app does all the math."
      />
      <Card className="p-4 h-[70vh] flex flex-col">
        <AssistantChat />
      </Card>
    </div>
  );
}
