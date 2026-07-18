// RAG (Retrieval-Augmented Generation) practice pack — the retrieval pipeline
// from scratch: chunk/tokenize, embed as a fixed-length vector, score by
// cosine similarity, rank, retrieve, assemble a grounded prompt. No network
// calls and no real embedding model — a deterministic toy embedding (word
// counts over a fixed vocabulary) stands in, same spirit as the from-scratch
// linear-regression pack standing in for sklearn. Every score in this pack
// works out to exactly 0.0 or 1.0 (the vocabulary was chosen so the docs
// don't overlap on any word except the query's own topic), so assertions are
// exact equality, not tolerance checks.

import { pyRowsLiteral, type DataRow, type DrillContent } from "./drillContent";
import type { DrillPack } from "./packs";

const DOC_ROWS: DataRow[] = [
  { id: "airflow", text: "Airflow schedules and orchestrates data pipelines as DAGs of tasks." },
  { id: "pandas", text: "Pandas provides DataFrames for fast, vectorised data analysis in Python." },
  { id: "rag", text: "Retrieval augmented generation retrieves relevant text before generating an answer." },
  { id: "embedding", text: "A vector embedding represents text as a list of numbers capturing meaning." },
  { id: "cosine", text: "Cosine similarity measures the angle between two vectors to score how close they are." },
];

const SETUP = `import re

${pyRowsLiteral(DOC_ROWS)}

VOCAB = ["airflow", "pipeline", "pandas", "dataframe", "retrieval", "generation",
         "vector", "embedding", "cosine", "similarity", "schedule", "data"]

def tokenize(text):
    return re.findall(r"[a-z]+", text.lower())`;

export const RAG_PIPELINE: DrillContent = {
  dataKind: "rows",
  cumulative: true,
  scenario: {
    title: "RAG — a retrieval pipeline from scratch",
    role: "Five short documents in `rows`. VOCAB and tokenize() are given — build the rest of a retrieval-augmented-generation pipeline yourself: embed, score, rank, retrieve, and assemble a grounded prompt.",
    goal: "These cells BUILD ONE PIPELINE across the pack: turn text into vectors, score a query against every document, keep the best matches, and assemble the final prompt from just the retrieved context.",
    outcome: "You built RAG end-to-end: a toy embedding, cosine similarity, ranking, a relevance cutoff, and a prompt that's grounded only in the retrieved documents — the shape of every real RAG pipeline, minus the network calls.",
    setupCode: SETUP,
    dataset: DOC_ROWS,
  },
  cells: [
    {
      id: "embed",
      task: "Write embed(text) — a function returning a vector: for each word in VOCAB, how many times it appears in tokenize(text).",
      why: "This is the toy embedding: a fixed-length vector where each position counts one vocabulary word. Real embeddings are learned; this one is countable by hand.",
      focus: ["text"],
      solution: `def embed(text):
    tokens = tokenize(text)
    return [tokens.count(w) for w in VOCAB]

sample = embed(rows[0]["text"])`,
      assertions: `assert sample == [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]`,
      narrative: `tokenize(text) lowercases and splits into words; counting each VOCAB word's occurrences turns free text into a fixed-length number vector — the same shape for every document, however long.`,
    },
    {
      id: "doc_vectors",
      task: "Create doc_vectors — the embed() vector for every row's text, in order.",
      why: "Every document needs to live in the same vector space as the query before anything can be compared.",
      focus: ["text"],
      solution: `doc_vectors = [embed(r["text"]) for r in rows]`,
      assertions: `assert len(doc_vectors) == 5
assert all(len(v) == len(VOCAB) for v in doc_vectors)
assert doc_vectors[2] == [0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0]`,
      narrative: `One embed() call per row builds the corpus's vector index — this is the "embed and store" half of RAG, done as a list instead of a vector database.`,
    },
    {
      id: "qvec",
      task: `Create qvec — the embedding of the query "how does retrieval augmented generation work".`,
      why: "The query has to land in the same vector space as the documents to be comparable at all.",
      solution: `query = "how does retrieval augmented generation work"
qvec = embed(query)`,
      assertions: `assert qvec == [0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0]`,
      narrative: `Words outside VOCAB ("how", "does", "work") just don't move any position — only "retrieval" and "generation" register, which is exactly what should distinguish this query.`,
    },
    {
      id: "cosine",
      task: "Write cosine(a, b) — the cosine similarity between two equal-length vectors.",
      why: "Cosine similarity scores how much two vectors point the same direction, independent of their length — the standard retrieval metric.",
      solution: `def cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(y * y for y in b) ** 0.5
    return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0

c = round(cosine([1, 0, 1], [1, 0, 0]), 4)`,
      assertions: `assert c == 0.7071`,
      narrative: `The dot product measures overlap; dividing by both vectors' magnitudes normalises away length, leaving a score of 1.0 for identical direction and 0.0 for no overlap at all.`,
    },
    {
      id: "scores",
      task: "Create scores — cosine(qvec, v), rounded to 4dp, for every vector in doc_vectors.",
      why: "One similarity score per document is the raw material for ranking.",
      solution: `scores = [round(cosine(qvec, v), 4) for v in doc_vectors]`,
      assertions: `assert scores == [0.0, 0.0, 1.0, 0.0, 0.0]`,
      narrative: `The RAG doc shares both "retrieval" and "generation" with the query and nothing else does, so it scores a clean 1.0 while the rest score 0.0 — the vocabulary was picked so there's no ambiguity here.`,
    },
    {
      id: "ranked",
      task: "Create ranked — (id, score) pairs for every row, sorted by score descending.",
      why: "Sorting by score turns raw similarities into a retrieval order — best match first.",
      solution: `ranked = sorted(zip([r["id"] for r in rows], scores), key=lambda p: p[1], reverse=True)`,
      assertions: `assert ranked[0] == ("rag", 1.0)`,
      narrative: `zip pairs each id with its score; sorted(..., reverse=True) puts the strongest match first — the ranking every retriever ultimately produces.`,
    },
    {
      id: "top_k",
      task: "Create top_k — the ids of the top 2 ranked documents.",
      why: "Retrieval is always top-k, not top-1 — a little redundancy protects against one imperfect match.",
      solution: `top_k = [doc_id for doc_id, score in ranked[:2]]`,
      assertions: `assert top_k[0] == "rag"
assert len(top_k) == 2`,
      narrative: `Slicing the ranked list to :2 and pulling out just the ids gives the set of documents that will actually get passed to the model.`,
    },
    {
      id: "context",
      task: "Create context — the text of every row whose id is in top_k, joined by newlines.",
      why: "The retrieved text — not the whole corpus — is what actually gets fed to the model.",
      focus: ["id", "text"],
      solution: `context = "\\n".join(r["text"] for r in rows if r["id"] in top_k)`,
      assertions: `assert "Retrieval augmented generation" in context`,
      narrative: `Filtering rows down to just the retrieved ids and joining their text is the "augmented" half of RAG — the context the generation step will be grounded in.`,
    },
    {
      id: "prompt",
      task: "Create prompt — a string with the context, then the question, then an instruction to answer using only the context above.",
      why: "This is the actual payload sent to an LLM in a RAG system — retrieved context plus the question, with an explicit grounding instruction.",
      solution: `prompt = f"Context:\\n{context}\\n\\nQuestion: {query}\\nAnswer using only the context above."`,
      assertions: `assert prompt.startswith("Context:\\n")
assert query in prompt
assert "Answer using only the context above." in prompt`,
      narrative: `Structuring the prompt as context, then question, then an explicit instruction is what keeps the model's answer grounded in what was retrieved instead of its own memory.`,
    },
    {
      id: "relevant",
      task: "Create relevant — the ids from ranked whose score is above 0.2.",
      why: "A relevance cutoff stops the pipeline from forcing in a document that doesn't actually match — better to retrieve nothing than something irrelevant.",
      solution: `relevant = [doc_id for doc_id, score in ranked if score > 0.2]`,
      assertions: `assert relevant == ["rag"]`,
      narrative: `Filtering ranked by a score threshold — not just taking top-k blindly — is the guardrail real RAG systems add so an unrelated query doesn't retrieve confident-looking nonsense.`,
    },
  ],
};

export const RAG_PACKS: DrillPack[] = [
  {
    id: "rag",
    title: "RAG pipeline",
    blurb: "Chunk, embed, cosine similarity, rank, retrieve, ground a prompt. Builds up. 10 reps.",
    tag: "rag",
    lang: "python",
    content: RAG_PIPELINE,
  },
];
