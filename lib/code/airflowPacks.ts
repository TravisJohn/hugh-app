// Airflow DAG practice pack — orchestration syntax, from scratch.
//
// Real Airflow can't run in Pyodide (it needs a scheduler, a metadata DB, and a
// pile of C-extension deps) so `setupCode` defines a small shim — DAG,
// (Python)Operator, `>>`/`<<` chaining, and the `@task` TaskFlow decorator —
// that mirrors Airflow's public authoring API closely enough that real DAG
// code runs and its dependency graph can be asserted on. This teaches the
// authoring syntax (what you'd actually type in a dags/ file), not the
// scheduler itself.
//
// Cumulative: one DAG is built up across the pack, cell by cell, ending with a
// topological read of the graph — mirrors the shape of the linear-regression
// and forecasting packs. Every solution + hidden assert verified in real
// CPython (with no `airflow` package installed) before shipping.

import type { DrillContent } from "./drillContent";
import type { DrillPack } from "./packs";

const AIRFLOW_SHIM = `from datetime import timedelta

class BaseOperator:
    def __init__(self, task_id, dag=None, retries=0, retry_delay=None, **kwargs):
        self.task_id = task_id
        self.retries = retries
        self.retry_delay = retry_delay
        self.upstream_list = []
        self.downstream_list = []
        self.dag = dag
        if dag is not None:
            dag.tasks[task_id] = self

    def set_downstream(self, other):
        if isinstance(other, list):
            for o in other:
                self.set_downstream(o)
            return other
        if self not in other.upstream_list:
            other.upstream_list.append(self)
        if other not in self.downstream_list:
            self.downstream_list.append(other)
        return other

    def set_upstream(self, other):
        if isinstance(other, list):
            for o in other:
                self.set_upstream(o)
            return other
        other.set_downstream(self)
        return self

    def __rshift__(self, other):
        return self.set_downstream(other)

    def __lshift__(self, other):
        return self.set_upstream(other)

    def __rrshift__(self, others):
        for o in others:
            o.set_downstream(self)
        return self

    def __rlshift__(self, others):
        for o in others:
            o.set_upstream(self)
        return self


class PythonOperator(BaseOperator):
    def __init__(self, task_id, python_callable, dag=None, **kwargs):
        super().__init__(task_id, dag=dag, **kwargs)
        self.python_callable = python_callable


class DAG:
    def __init__(self, dag_id, schedule_interval=None, default_args=None, catchup=False):
        self.dag_id = dag_id
        self.schedule_interval = schedule_interval
        self.default_args = default_args or {}
        self.catchup = catchup
        self.tasks = {}

    def topological_order(self):
        indegree = {tid: len(op.upstream_list) for tid, op in self.tasks.items()}
        queue = [tid for tid, d in indegree.items() if d == 0]
        order = []
        while queue:
            tid = queue.pop(0)
            order.append(tid)
            for op in self.tasks[tid].downstream_list:
                indegree[op.task_id] -= 1
                if indegree[op.task_id] == 0:
                    queue.append(op.task_id)
        return order


def task(fn=None, *, dag=None, task_id=None, **op_kwargs):
    def decorator(f):
        def build(*args, **kwargs):
            tid = task_id or f.__name__
            op = PythonOperator(task_id=tid, python_callable=lambda: f(*args, **kwargs), dag=dag, **op_kwargs)
            return op
        return build
    if fn is not None and callable(fn):
        return decorator(fn)
    return decorator`;

export const AIRFLOW_DAGS: DrillContent = {
  dataKind: "rows",
  cumulative: true,
  scenario: {
    title: "Airflow DAGs — orchestration syntax, from scratch",
    role: "DAG, PythonOperator, and the @task decorator above behave like Airflow's real authoring API — dependencies, retries, TaskFlow — just without a live scheduler behind them. Real Airflow syntax throughout.",
    goal: "These cells BUILD ONE DAG across the pack: create it, add tasks, wire a fan-out/fan-in dependency, configure retries, add a TaskFlow task, and read back the execution order.",
    outcome: "You built a 5-task DAG — extract, transform, backup, load, summarize — with a diamond dependency and a TaskFlow task on the end, using the same >>, PythonOperator, and @task syntax you'd write against real Airflow.",
    setupCode: AIRFLOW_SHIM,
  },
  cells: [
    {
      id: "dag",
      task: `Create dag — a DAG with dag_id "daily_sales_etl", schedule_interval "@daily", and default_args={"retries": 2}.`,
      why: "DAG(...) is the top-level object every task in the pipeline registers into.",
      solution: `dag = DAG(dag_id="daily_sales_etl", schedule_interval="@daily", default_args={"retries": 2})`,
      assertions: `assert dag.dag_id == "daily_sales_etl"
assert dag.schedule_interval == "@daily"
assert dag.tasks == {}`,
      narrative: `dag_id names the pipeline, schedule_interval says when it runs, default_args seeds settings every task inherits. dag.tasks starts empty until operators register.`,
    },
    {
      id: "extract",
      task: `Create extract — a PythonOperator with task_id "extract", python_callable returning "raw_data", registered to dag.`,
      why: "PythonOperator is the everyday task type: a task_id, a callable to run, and the dag it belongs to.",
      solution: `extract = PythonOperator(task_id="extract", python_callable=lambda: "raw_data", dag=dag)`,
      assertions: `assert extract.task_id == "extract"
assert "extract" in dag.tasks
assert extract.python_callable() == "raw_data"`,
      narrative: `Passing dag=dag registers the operator into dag.tasks the moment it's constructed — no separate "add task" call needed.`,
    },
    {
      id: "transform",
      task: `Create transform — a PythonOperator with task_id "transform", python_callable returning "clean_data", registered to dag.`,
      why: "Same shape as extract — every task in a DAG is authored identically.",
      solution: `transform = PythonOperator(task_id="transform", python_callable=lambda: "clean_data", dag=dag)`,
      assertions: `assert transform.task_id == "transform"
assert "transform" in dag.tasks`,
      narrative: `A second operator, registered the same way — the DAG accumulates tasks one PythonOperator at a time.`,
    },
    {
      id: "backup",
      task: `Create backup — a PythonOperator with task_id "backup", python_callable returning "archived", registered to dag.`,
      why: "A third, independent task — set up now so the next cell can fan work out to it in parallel with transform.",
      solution: `backup = PythonOperator(task_id="backup", python_callable=lambda: "archived", dag=dag)`,
      assertions: `assert backup.task_id == "backup"
assert "backup" in dag.tasks`,
      narrative: `backup runs the same stage as transform but does something different with the data — the two will run in parallel once wired.`,
    },
    {
      id: "load",
      task: `Create load — a PythonOperator with task_id "load", python_callable returning "loaded", registered to dag.`,
      why: "The pipeline's last stage — both transform and backup will feed into it.",
      solution: `load = PythonOperator(task_id="load", python_callable=lambda: "loaded", dag=dag)`,
      assertions: `assert load.task_id == "load"
assert "load" in dag.tasks
assert len(dag.tasks) == 4`,
      narrative: `Four tasks now registered on dag — the pieces are in place, none of them wired to each other yet.`,
    },
    {
      id: "pipeline",
      task: "Create pipeline — wire extract before both transform and backup, and both of those before load, in one chained expression.",
      why: ">> is Airflow's dependency operator; chaining through a list fans one task out to several, or several back into one.",
      solution: `pipeline = extract >> [transform, backup] >> load`,
      assertions: `assert pipeline is load
assert extract in transform.upstream_list
assert extract in backup.upstream_list
assert transform in load.upstream_list
assert backup in load.upstream_list
assert len(load.upstream_list) == 2`,
      narrative: `extract >> [transform, backup] sets extract upstream of both (fan-out); [transform, backup] >> load then sets both upstream of load (fan-in) — a diamond, in one line.`,
    },
    {
      id: "configured",
      task: "Set load's retries to 3 and retry_delay to a 5-minute timedelta, then create configured as load.",
      why: "retries and retry_delay are the standard resilience knobs on any operator — how many attempts, and how long to wait between them.",
      solution: `load.retries = 3
load.retry_delay = timedelta(minutes=5)
configured = load`,
      assertions: `assert configured.retries == 3
assert configured.retry_delay == timedelta(minutes=5)`,
      narrative: `These are plain attributes on the operator — set them directly after construction, or pass them as constructor kwargs up front.`,
    },
    {
      id: "summarize_task",
      task: `Write a summarize_fn function decorated with @task(dag=dag, task_id="summarize") that returns "summary ready"; create summarize_task by calling it.`,
      why: "The @task decorator (TaskFlow API) is the modern alternative to PythonOperator — decorate a plain function, call it to get a task instance.",
      solution: `@task(dag=dag, task_id="summarize")
def summarize_fn():
    return "summary ready"

summarize_task = summarize_fn()`,
      assertions: `assert summarize_task.task_id == "summarize"
assert "summarize" in dag.tasks
assert summarize_task.python_callable() == "summary ready"
assert len(dag.tasks) == 5`,
      narrative: `@task(dag=dag, task_id="summarize") turns summarize_fn into a task builder; calling it registers a real task on dag and hands back the task instance — same registration as PythonOperator, less boilerplate.`,
    },
    {
      id: "chained",
      task: "Create chained — wire load before summarize_task.",
      why: "TaskFlow task instances chain with >> exactly like PythonOperator ones — one dependency API for both styles.",
      solution: `chained = load >> summarize_task`,
      assertions: `assert chained is summarize_task
assert load in summarize_task.upstream_list
assert summarize_task in load.downstream_list`,
      narrative: `Nothing special is needed to mix TaskFlow and classic operators — both are task objects underneath, so >> works the same way.`,
    },
    {
      id: "order",
      task: "Create order — dag's topological execution order.",
      why: "The dependency graph you built determines the order Airflow is allowed to run tasks in — read it back to check the wiring.",
      solution: `order = dag.topological_order()`,
      assertions: `assert order.index("extract") < order.index("transform")
assert order.index("extract") < order.index("backup")
assert order.index("transform") < order.index("load")
assert order.index("backup") < order.index("load")
assert order.index("load") < order.index("summarize")
assert len(order) == 5`,
      narrative: `topological_order() walks the graph from tasks with no upstream dependencies outward — a valid run order respects every >> you wired in, even though transform/backup and their exact tie-break position aren't fixed.`,
    },
  ],
};

// No tabular dataset here — DrillMock falls back to showing setupCode as text
// when `scenario.dataset` is omitted, which fits a code-shim scenario better
// than a data table would.
export const AIRFLOW_PACKS: DrillPack[] = [
  {
    id: "airflow",
    title: "Airflow DAGs",
    blurb: "DAG, PythonOperator, >> chaining, retries, @task TaskFlow. Builds up. 10 reps.",
    tag: "airflow",
    lang: "python",
    content: AIRFLOW_DAGS,
  },
];
