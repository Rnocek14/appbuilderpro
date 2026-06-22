-- LearnFlow seed data — sample courses, modules, lessons, quizzes & questions.
-- Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING, so re-running is safe.
-- Content tables only (no user data); profiles/enrollments come from real signups.

-- Courses ---------------------------------------------------------------
insert into public.courses (id, title, description, thumbnail, category, level, duration_minutes, instructor) values
  ('11111111-1111-1111-1111-111111110001', 'Introduction to Web Development',
   'Go from zero to your first web page. Learn how the web works, then build and style real pages with HTML and CSS.',
   'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800', 'Programming', 'Beginner', 180, 'Ada Bryant'),
  ('11111111-1111-1111-1111-111111110002', 'UX Design Foundations',
   'Learn the mindset and methods of great product design: empathize with users, define problems, and prototype solutions.',
   'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800', 'Design', 'Beginner', 120, 'Mateo Reyes')
on conflict (id) do nothing;

-- Modules ---------------------------------------------------------------
insert into public.modules (id, course_id, title, "order") values
  ('22222222-2222-2222-2222-222222220001', '11111111-1111-1111-1111-111111110001', 'Getting Started', 1),
  ('22222222-2222-2222-2222-222222220002', '11111111-1111-1111-1111-111111110001', 'HTML & CSS', 2),
  ('22222222-2222-2222-2222-222222220003', '11111111-1111-1111-1111-111111110002', 'Design Thinking', 1)
on conflict (id) do nothing;

-- Lessons ---------------------------------------------------------------
insert into public.lessons (id, module_id, title, description, video_url, duration_seconds, "order") values
  ('33333333-3333-3333-3333-333333330001', '22222222-2222-2222-2222-222222220001', 'What Is the Web?',
   'A quick mental model of browsers, servers, and how a page reaches your screen.',
   'https://www.youtube.com/watch?v=hJHvdBlSxug', 420, 1),
  ('33333333-3333-3333-3333-333333330002', '22222222-2222-2222-2222-222222220001', 'Setting Up Your Editor',
   'Install VS Code and configure a comfortable, productive workspace.',
   'https://www.youtube.com/watch?v=ORmExL2bg8E', 540, 2),
  ('33333333-3333-3333-3333-333333330003', '22222222-2222-2222-2222-222222220002', 'HTML Basics',
   'Structure a page with the essential HTML elements: headings, text, links, and images.',
   'https://www.youtube.com/watch?v=qz0aGYrrlhU', 780, 1),
  ('33333333-3333-3333-3333-333333330004', '22222222-2222-2222-2222-222222220002', 'Styling With CSS',
   'Make it beautiful: selectors, the box model, colors, and layout fundamentals.',
   'https://www.youtube.com/watch?v=1PnVor36_40', 900, 2),
  ('33333333-3333-3333-3333-333333330005', '22222222-2222-2222-2222-222222220003', 'Empathize & Define',
   'Understand real user needs and frame the right problem before designing anything.',
   'https://www.youtube.com/watch?v=_r0VX-aU_T8', 600, 1),
  ('33333333-3333-3333-3333-333333330006', '22222222-2222-2222-2222-222222220003', 'Prototyping',
   'Turn ideas into low- and high-fidelity prototypes you can test fast.',
   'https://www.youtube.com/watch?v=JuZkfzWP4Eo', 660, 2)
on conflict (id) do nothing;

-- Quizzes ---------------------------------------------------------------
insert into public.quizzes (id, module_id, title) values
  ('44444444-4444-4444-4444-444444440001', '22222222-2222-2222-2222-222222220001', 'Getting Started Quiz'),
  ('44444444-4444-4444-4444-444444440002', '22222222-2222-2222-2222-222222220002', 'HTML & CSS Quiz'),
  ('44444444-4444-4444-4444-444444440003', '22222222-2222-2222-2222-222222220003', 'Design Thinking Quiz')
on conflict (id) do nothing;

-- Quiz questions --------------------------------------------------------
insert into public.quiz_questions (id, quiz_id, question, options, correct_index, "order") values
  ('55555555-5555-5555-5555-555555550001', '44444444-4444-4444-4444-444444440001',
   'What does a web browser do?',
   '["Stores your files in the cloud","Requests pages from servers and renders them","Compiles your code into an app","Hosts your website for others"]'::jsonb, 1, 1),
  ('55555555-5555-5555-5555-555555550002', '44444444-4444-4444-4444-444444440001',
   'Which tool is a popular code editor?',
   '["Photoshop","Excel","VS Code","Slack"]'::jsonb, 2, 2),
  ('55555555-5555-5555-5555-555555550003', '44444444-4444-4444-4444-444444440002',
   'Which HTML tag creates the largest heading?',
   '["<h6>","<head>","<h1>","<title>"]'::jsonb, 2, 1),
  ('55555555-5555-5555-5555-555555550004', '44444444-4444-4444-4444-444444440002',
   'What does CSS primarily control?',
   '["Page logic and data","The visual presentation and layout","Server responses","Database queries"]'::jsonb, 1, 2),
  ('55555555-5555-5555-5555-555555550005', '44444444-4444-4444-4444-444444440003',
   'What is the first stage of design thinking?',
   '["Prototype","Test","Empathize","Launch"]'::jsonb, 2, 1)
on conflict (id) do nothing;
