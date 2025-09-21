import Link from "next/link";
import { Button } from "@/components/ui/button"; // From our shared UI library
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

type CourseCardProps = {
  id: number;
  title: string;
  description: string;
  thumbnail_url: string;
};

export function CourseCard({ id, title, description, thumbnail_url }: CourseCardProps) {
  return (
    <Card className="flex flex-col overflow-hidden hover:border-blue-500/50 transition-colors">
      <CardHeader className="p-0">
        <img src={thumbnail_url} alt={title} className="w-full h-48 object-cover" />
      </CardHeader>
      <div className="p-6 flex flex-col flex-grow">
        <CardTitle>{title}</CardTitle>
        <CardDescription className="mt-2 flex-grow">{description}</CardDescription>
        <CardFooter className="p-0 pt-6">
          <Button asChild className="w-full bg-blue-600 hover:bg-blue-700 text-white">
            <Link href={`/courses/${id}`}>Start Course</Link>
          </Button>
        </CardFooter>
      </div>
    </Card>
  );
}