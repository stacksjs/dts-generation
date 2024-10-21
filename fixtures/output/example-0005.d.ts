export declare const defaultHeaders: {
  'Content-Type': 'application/json',
}
export interface Comment {
  id: number
  postId: number
  body: string
}
export interface CommentsResponse {
  comments: Comment[]
}
export declare function fetchComments(postId: number): Promise<CommentsResponse>
