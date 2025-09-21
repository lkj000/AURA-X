import { CourseCard } from "@/components/CourseCard";

// This would be fetched from the `academy_service` API
const courses = [
  { id: 1, title: 'Introduction to Aura-X', description: 'Learn the fundamentals of the Aura-X ecosystem.', thumbnail_url: '/thumbnails/course1.jpg' },
  { id: 2, title: 'Advanced Synthesis', description: 'Master the powerful synthesis engines within Aura-X.', thumbnail_url: '/thumbnails/course2.jpg' },
  { id: 3, title: 'Monetizing Your Style', description: 'A guide to the Style Exchange and Micro-Royalty system.', thumbnail_url: '/thumbnails/course3.jpg' },
];

export default function CoursesPage() {
  return (
    <div className="container mx-auto p-4 md:p-8">
      <header className="mb-8">
        <h1 className="text-4xl font-extrabold tracking-tight">Aura-X Academy</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Master the art and science of modern music production with our curated courses.
        </p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {courses.map(course => (
          <CourseCard key={course.id} {...course} />
        ))}
      </div>
    </div>
  );
}