PlanPannel, a web app that app converts deadlines into a realistic 7-day schedule using difficulty + urgency scoring, respects daily availability, tracks progress persistently, and includes a built-in Pomodoro timer — plus it flags overload with exact shortfall so students can adjust expectations

Contains front-end App file that holds the UI, components that have back-end functionality, lib that sets up the supabase client and supabase which holds the information tying the application to the database. Tailwind could not be imported, please make sure tailwind is installed to validate the css styling and make sure the lib folder holds supabase url and key.

ex:export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL! <--- your supabase url,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! <-- your supabase key
);


The 7 day plan generation prioritizes assessments using score = (difficulty + 1) / (daysLeft + 1). So harder and more urgent tasks are scheduled first, it allocates work only up to the daily availability, and breaks it into study blocks of 30 minutes

The user gets to create courses with difficulty rating (1-5) and assessments and due dates within that course category.

The 7 day plan depends on the weekly availability of the user and defines how many hours a usr can study in a day, the planer respects these limits automatically.

Tasks are saved in the supabase and persists after refreshing the page, which allows for a progress bar to be demonstrated

A pomodoro timer is added to the task page that helps users focus harder and motivates them to finish their tasks for the day. 

If work exceeds availabiltiy, it calculates exact shortfall, displays a clear warning and shows how many hours youre short by.

How it works
User logs in
User enters:
  courses (with difficulty)
  assessments (with due dates & estimates)
  daily availability

Plan generator:
  scores assessments by difficulty & urgency
  fills days until availability is exhausted
  records any overflow as shortfall

Generated study blocks are saved to the database

Plan page:

  displays the next 7 days
  tracks completion
  shows progress + Pomodoro timer
  warns if workload is unrealistic
