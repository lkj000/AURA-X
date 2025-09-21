import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type StyleCardProps = {
  title: string;
  user: string;
  price: number;
  artUrl: string;
  experienceType: 'audio' | 'immersive_pack';
};

export function StyleCard({ title, user, price, artUrl, experienceType }: StyleCardProps) {
  return (
    <Card className="w-full overflow-hidden hover:border-purple-500 transition-colors group">
      <CardHeader className="p-0 relative">
        <img src={artUrl} alt={title} className="w-full h-48 object-cover" />
        {experienceType === 'immersive_pack' && (
          <Badge className="absolute top-2 right-2 bg-purple-600 text-white">AR</Badge>
        )}
      </CardHeader>
      <CardContent className="p-4">
        <CardTitle className="truncate">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">by {user}</p>
      </CardContent>
      <CardFooter className="p-4 flex justify-between items-center">
        <span className="font-bold text-purple-500">{price} Credits</span>
        <Button size="sm" className="bg-purple-500 hover:bg-purple-600 text-white">
          Use Style
        </Button>
      </CardFooter>
    </Card>
  );
}