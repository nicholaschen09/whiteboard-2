"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Circle,
  MousePointer,
  Pencil,
  Square,
  Trash2,
  Type,
  Download,
  Undo,
  Redo,
  Users,
  Share2,
  ImageIcon,
  Sticker,
  StickyNote,
  Eraser,
  Layers,
  Settings,
  Save,
} from "lucide-react"
import { ColorPicker } from "./color-picker"
import { ShareDialog } from "./share-dialog"
import { StickersPanel } from "./stickers-panel"
import { ImageUploader } from "./image-uploader"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { Separator } from "@/components/ui/separator"
import { SettingsPanel } from "./settings-panel"
import { LayersPanel } from "./layers-panel"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { HelpDialog } from "./help-dialog"
import { Input } from "@/components/ui/input"
import { createWebSocket } from "@/lib/websocket"

// Initialize with just the current user
const initialUsers = [
  { id: 1, name: "You", avatar: "/placeholder.svg?height=40&width=40", color: "#FF5733", x: 100, y: 150, online: true }
]

type Tool =
  | "select"
  | "pen"
  | "rectangle"
  | "circle"
  | "triangle"
  | "line"
  | "text"
  | "sticker"
  | "image"
  | "arrow"
  | "note"
  | "eraser"

type DrawingElement = {
  id: string
  type: Tool
  points?: { x: number; y: number }[]
  x?: number
  y?: number
  width?: number
  height?: number
  text?: string
  color: string
  userId: number
  stickerType?: string
  imageUrl?: string
  lineWidth?: number
  fontSize?: number  // Add fontSize property
}

type Layer = {
  id: string
  name: string
  visible: boolean
  locked: boolean
  elements: DrawingElement[]
}

interface BrainboardProps {
  boardId?: string
}

export function Brainboard({ boardId }: BrainboardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [context, setContext] = useState<CanvasRenderingContext2D | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentTool, setCurrentTool] = useState<Tool>("pen")
  const [currentColor, setCurrentColor] = useState("#4B5563") // Slate-600 grey color
  const [elements, setElements] = useState<DrawingElement[]>([])
  const [history, setHistory] = useState<DrawingElement[][]>([[]])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [currentElement, setCurrentElement] = useState<DrawingElement | null>(null)
  const [users, setUsers] = useState(initialUsers)
  const [showUsers, setShowUsers] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [showStickers, setShowStickers] = useState(false)
  const [showImageUploader, setShowImageUploader] = useState(false)
  const [lineWidth, setLineWidth] = useState(2)
  const [socket, setSocket] = useState<any>(null)
  const [isConnected, setIsConnected] = useState(false)
  const { toast } = useToast()
  const [currentPosition, setCurrentPosition] = useState<{ x: number; y: number } | null>(null)
  const [activeTab, setActiveTab] = useState<string>("draw")
  const [showSettings, setShowSettings] = useState(false)
  const [layers, setLayers] = useState<Layer[]>([{
    id: "default",
    name: "Default Layer",
    visible: true,
    locked: false,
    elements: []
  }])
  const [showLayers, setShowLayers] = useState(false)
  const [activeLayer, setActiveLayer] = useState<string>("default")
  const [showGrid, setShowGrid] = useState(false)
  const [snapToGrid, setSnapToGrid] = useState(false)
  const GRID_SIZE = 20 // Size of grid cells in pixels
  const [eraserSize, setEraserSize] = useState(10) // Default eraser size
  const [showHelp, setShowHelp] = useState(false)
  const [showTextInput, setShowTextInput] = useState(false)
  const [textInputPosition, setTextInputPosition] = useState<{ x: number; y: number } | null>(null)
  const [textInputValue, setTextInputValue] = useState("")
  const [selectedElement, setSelectedElement] = useState<DrawingElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [isResizing, setIsResizing] = useState(false)
  const [resizeDirection, setResizeDirection] = useState<'nw' | 'ne' | 'sw' | 'se' | null>(null)
  const [originalSize, setOriginalSize] = useState<{ width: number; height: number; x: number; y: number } | null>(null)
  const [resizeStartPoint, setResizeStartPoint] = useState<{ x: number; y: number } | null>(null)

  // Add temporary canvas ref
  const tempCanvasRef = useRef<HTMLCanvasElement>(null)
  const [tempContext, setTempContext] = useState<CanvasRenderingContext2D | null>(null)

  // Add image cache state
  const [imageCache, setImageCache] = useState<{ [key: string]: HTMLImageElement }>({})

  // Add function to preload image
  const preloadImage = (imageUrl: string) => {
    if (imageCache[imageUrl]) return imageCache[imageUrl]

    const img = new Image()
    img.src = imageUrl
    img.crossOrigin = "anonymous"
    setImageCache(prev => ({ ...prev, [imageUrl]: img }))
    return img
  }

  // Load saved data on initial render
  useEffect(() => {
    try {
      const savedElements = localStorage.getItem('whiteboard-elements')
      if (savedElements) {
        const parsedElements = JSON.parse(savedElements)
        setElements(parsedElements)
      }

      const savedLayers = localStorage.getItem('whiteboard-layers')
      if (savedLayers) {
        const parsedLayers = JSON.parse(savedLayers)
        setLayers(parsedLayers)
      }
    } catch (e) {
      console.error('Failed to load saved data:', e)
    }
  }, [])

  // Save elements whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('whiteboard-elements', JSON.stringify(elements))
    } catch (e) {
      console.error('Failed to save elements:', e)
    }
  }, [elements])

  // Save layers whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('whiteboard-layers', JSON.stringify(layers))
    } catch (e) {
      console.error('Failed to save layers:', e)
    }
  }, [layers])

  // Update elements when active layer changes
  useEffect(() => {
    const currentLayer = layers.find(layer => layer.id === activeLayer)
    if (currentLayer && JSON.stringify(currentLayer.elements) !== JSON.stringify(elements)) {
      setElements(currentLayer.elements)
    }
  }, [activeLayer])

  // Update layers when elements change
  useEffect(() => {
    const currentLayer = layers.find(layer => layer.id === activeLayer)
    if (currentLayer && JSON.stringify(currentLayer.elements) !== JSON.stringify(elements)) {
      setLayers(prevLayers =>
        prevLayers.map(layer =>
          layer.id === activeLayer
            ? { ...layer, elements: elements }
            : layer
        )
      )
    }
  }, [elements])

  // Set initial active layer
  useEffect(() => {
    if (layers.length > 0) {
      const firstVisibleLayer = layers.find(layer => layer.visible)
      if (firstVisibleLayer) {
        setActiveLayer(firstVisibleLayer.id)
      }
    }
  }, []) // Run only once on mount

  // Add this near the top of the component, after the useState declarations
  useEffect(() => {
    // Check if there's a board ID in the URL (for joining via share link)
    const checkForBoardId = () => {
      if (boardId) {
        // We found a board ID in the URL, so we're joining an existing board
        toast({
          title: "Joining Brainboard",
          description: `Connecting to board ${boardId}...`,
        })

        // In a real app, we would fetch the board data from the server
        // For now, we'll just simulate joining
        setTimeout(() => {
          toast({
            title: "Connected!",
            description: "You've joined the collaborative whiteboard",
          })
        }, 1500)

        return boardId
      }

      const path = window.location.pathname
      const boardIdMatch = path.match(/\/board\/([a-zA-Z0-9]+)/)

      if (boardIdMatch && boardIdMatch[1]) {
        const urlBoardId = boardIdMatch[1]

        // We found a board ID in the URL, so we're joining an existing board
        toast({
          title: "Joining Brainboard",
          description: `Connecting to board ${urlBoardId}...`,
        })

        // In a real app, we would fetch the board data from the server
        // For now, we'll just simulate joining
        setTimeout(() => {
          toast({
            title: "Connected!",
            description: "You've joined the collaborative whiteboard",
          })
        }, 1500)

        return urlBoardId
      }

      // No board ID in URL, check localStorage for previously created board
      return localStorage.getItem("brainboard-id") || null
    }

    const detectedBoardId = checkForBoardId()
    if (detectedBoardId) {
      console.log("Connected to board:", detectedBoardId)
      // In a real app, we would use this ID to connect to the specific board
    }
  }, [boardId])

  // Initialize WebSocket connection
  useEffect(() => {
    if (boardId) {
      const socket = createWebSocket(boardId)
      setWs(socket)

      socket.addEventListener("message", (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === "draw" && data.element) {
            setElements(prev => [...prev, data.element])
          } else if (data.type === "userMove") {
            setUsers(prev => prev.map(user =>
              user.id === data.userId
                ? { ...user, x: data.x, y: data.y }
                : user
            ))
          } else if (data.type === "clear") {
            setElements([])
          } else if (data.type === "layerUpdate") {
            setLayers(prev => prev.map(layer =>
              layer.id === data.layerId
                ? { ...layer, ...data.layer }
                : layer
            ))
          } else if (data.type === "sync") {
            setLayers(data.layers)
            setActiveLayer(data.activeLayer)
          }
        } catch (e) {
          console.error("Failed to handle WebSocket message:", e)
        }
      })

      return () => {
        socket.close()
      }
    }
  }, [boardId])

  // Initialize canvas context
  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current
      const ctx = canvas.getContext("2d", { willReadFrequently: true })

      // Set canvas size to match parent container
      const resizeCanvas = () => {
        const container = canvas.parentElement
        if (container) {
          const dpr = window.devicePixelRatio || 1
          const rect = container.getBoundingClientRect()

          // Set the canvas size accounting for device pixel ratio
          canvas.width = rect.width * dpr
          canvas.height = rect.height * dpr

          // Scale the context to ensure correct drawing
          ctx?.scale(dpr, dpr)

          // Set the canvas CSS size
          canvas.style.width = `${rect.width}px`
          canvas.style.height = `${rect.height}px`

          // Draw elements immediately after resizing
          if (ctx) {
            drawElements()
          }
        }
      }

      // Set initial size
      resizeCanvas()

      // Add resize listener
      window.addEventListener("resize", resizeCanvas)

      if (ctx) {
        setContext(ctx)
        // Draw elements immediately after setting context
        drawElements()
      }

      return () => {
        window.removeEventListener("resize", resizeCanvas)
      }
    }
  }, []) // Empty dependency array since we only want this to run once on mount

  // Redraw all elements when they change
  useEffect(() => {
    if (context && canvasRef.current) {
      drawElements()
    }
  }, [elements, context]) // Add context to dependencies

  // Add a new effect to handle initial load
  useEffect(() => {
    if (elements.length > 0 && context && canvasRef.current) {
      drawElements()
    }
  }, [context]) // This will run when context is first set

  // Simulate other users moving around
  useEffect(() => {
    const interval = setInterval(() => {
      setUsers((prevUsers) =>
        prevUsers.map((user) => {
          if (user.id !== 1 && user.online) {
            // Don't move the current user
            const newX = user.x + (Math.random() * 20 - 10)
            const newY = user.y + (Math.random() * 20 - 10)

            // Broadcast user movement
            if (socket && isConnected) {
              socket.send(
                JSON.stringify({
                  type: "userMove",
                  userId: user.id,
                  x: newX,
                  y: newY,
                }),
              )
            }

            return {
              ...user,
              x: newX,
              y: newY,
            }
          }
          return user
        }),
      )
    }, 2000)

    return () => clearInterval(interval)
  }, [socket, isConnected])

  // Add effect to redraw when grid settings change
  useEffect(() => {
    if (context && canvasRef.current) {
      drawElements()
    }
  }, [showGrid, snapToGrid]) // Add grid settings to dependencies

  // Update drawGrid function to make grid more visible
  const drawGrid = () => {
    if (!context || !canvasRef.current || !showGrid) return

    const canvas = canvasRef.current
    context.save()
    context.strokeStyle = 'rgba(229, 231, 235, 0.8)' // Light grey color with less transparency
    context.lineWidth = 1 // Make lines more visible

    // Draw vertical lines
    for (let x = 0; x <= canvas.width; x += GRID_SIZE) {
      context.beginPath()
      context.moveTo(x, 0)
      context.lineTo(x, canvas.height)
      context.stroke()
    }

    // Draw horizontal lines
    for (let y = 0; y <= canvas.height; y += GRID_SIZE) {
      context.beginPath()
      context.moveTo(0, y)
      context.lineTo(canvas.width, y)
      context.stroke()
    }

    context.restore()
  }

  // Update drawElements to show selection indicator for all element types
  const drawElements = () => {
    if (!context || !canvasRef.current) return

    const canvas = canvasRef.current
    context.clearRect(0, 0, canvas.width, canvas.height)

    // Draw grid first
    if (showGrid) {
      drawGrid()
    }

    // Draw elements from all visible layers
    layers.forEach(layer => {
      if (layer.visible) {
        layer.elements.forEach(element => {
          // Skip drawing if the layer is locked and we're not in select mode
          if (layer.locked && currentTool !== "select") return

          context.strokeStyle = element.color
          context.fillStyle = element.color
          context.lineWidth = element.lineWidth || 2

          switch (element.type) {
            case "pen":
              if (element.points && element.points.length > 0) {
                context.beginPath()
                context.lineCap = "round"
                context.lineJoin = "round"

                // Start from the first point
                context.moveTo(element.points[0].x, element.points[0].y)

                // If we only have 2 points, draw a straight line
                if (element.points.length === 2) {
                  context.lineTo(element.points[1].x, element.points[1].y)
                } else {
                  // For more than 2 points, use quadratic curves
                  for (let i = 1; i < element.points.length - 1; i++) {
                    // Calculate the midpoint between two points
                    const xc = (element.points[i].x + element.points[i + 1].x) / 2
                    const yc = (element.points[i].y + element.points[i + 1].y) / 2

                    // Use quadratic curve to smooth the line
                    context.quadraticCurveTo(element.points[i].x, element.points[i].y, xc, yc)
                  }

                  // For the last two points
                  const lastPoint = element.points[element.points.length - 1]
                  context.lineTo(lastPoint.x, lastPoint.y)
                }
                context.stroke()

                // Draw selection indicator if this element is selected
                if (selectedElement && selectedElement.id === element.id) {
                  const bounds = element.points.reduce(
                    (acc, point) => ({
                      minX: Math.min(acc.minX, point.x),
                      minY: Math.min(acc.minY, point.y),
                      maxX: Math.max(acc.maxX, point.x),
                      maxY: Math.max(acc.maxY, point.y)
                    }),
                    {
                      minX: element.points[0].x,
                      minY: element.points[0].y,
                      maxX: element.points[0].x,
                      maxY: element.points[0].y
                    }
                  )

                  // Draw selection rectangle
                  context.strokeStyle = "#3b82f6"
                  context.lineWidth = 1
                  context.strokeRect(
                    bounds.minX - 2,
                    bounds.minY - 2,
                    bounds.maxX - bounds.minX + 4,
                    bounds.maxY - bounds.minY + 4
                  )

                  // Draw resize handles
                  const handleSize = 8
                  context.fillStyle = "#3b82f6"
                  // Top-left
                  context.fillRect(bounds.minX - handleSize / 2, bounds.minY - handleSize / 2, handleSize, handleSize)
                  // Top-right
                  context.fillRect(bounds.maxX - handleSize / 2, bounds.minY - handleSize / 2, handleSize, handleSize)
                  // Bottom-left
                  context.fillRect(bounds.minX - handleSize / 2, bounds.maxY - handleSize / 2, handleSize, handleSize)
                  // Bottom-right
                  context.fillRect(bounds.maxX - handleSize / 2, bounds.maxY - handleSize / 2, handleSize, handleSize)
                }
              }
              break

            case "rectangle":
            case "circle":
            case "image":
            case "note":
              if (
                element.x !== undefined &&
                element.y !== undefined &&
                element.width !== undefined &&
                element.height !== undefined
              ) {
                // Draw the element
                if (element.type === "rectangle") {
                  context.beginPath()
                  context.rect(element.x, element.y, element.width, element.height)
                  context.stroke()
                } else if (element.type === "circle") {
                  const centerX = element.x + element.width / 2
                  const centerY = element.y + element.width / 2
                  const radius = element.width / 2
                  context.beginPath()
                  context.arc(centerX, centerY, radius, 0, Math.PI * 2)
                  context.stroke()
                } else if (element.type === "image" && element.imageUrl) {
                  const img = imageCache[element.imageUrl] || preloadImage(element.imageUrl)
                  if (img.complete) {
                    context.drawImage(img, element.x, element.y, element.width, element.height)
                  }
                } else if (element.type === "note" && element.text) {
                  // Draw sticky note background with solid color
                  context.fillStyle = element.color
                  context.fillRect(element.x, element.y, element.width, element.height)
                  // Draw text
                  context.fillStyle = "#000000"
                  context.font = "14px Inter, sans-serif"
                  const words = element.text.split(" ")
                  let line = ""
                  const lineHeight = 18
                  let offsetY = 20
                  for (let i = 0; i < words.length; i++) {
                    const testLine = line + words[i] + " "
                    const metrics = context.measureText(testLine)
                    if (metrics.width > element.width - 20 && i > 0) {
                      context.fillText(line, element.x + 10, element.y + offsetY)
                      line = words[i] + " "
                      offsetY += lineHeight
                    } else {
                      line = testLine
                    }
                  }
                  context.fillText(line, element.x + 10, element.y + offsetY)
                }

                // Draw selection indicator if this element is selected
                if (selectedElement && selectedElement.id === element.id) {
                  context.strokeStyle = "#3b82f6"
                  context.lineWidth = 1
                  context.strokeRect(
                    element.x - 2,
                    element.y - 2,
                    element.width + 4,
                    element.height + 4
                  )

                  // Draw resize handles
                  const handleSize = 8
                  context.fillStyle = "#3b82f6"
                  // Top-left
                  context.fillRect(element.x - handleSize / 2, element.y - handleSize / 2, handleSize, handleSize)
                  // Top-right
                  context.fillRect(element.x + element.width - handleSize / 2, element.y - handleSize / 2, handleSize, handleSize)
                  // Bottom-left
                  context.fillRect(element.x - handleSize / 2, element.y + element.height - handleSize / 2, handleSize, handleSize)
                  // Bottom-right
                  context.fillRect(element.x + element.width - handleSize / 2, element.y + element.height - handleSize / 2, handleSize, handleSize)
                }
              }
              break

            case "text":
              if (element.x !== undefined && element.y !== undefined && element.text) {
                context.font = `${element.fontSize || 16}px Inter, sans-serif`
                context.fillStyle = element.color
                context.fillText(element.text, element.x, element.y)

                // Draw selection indicator if this element is selected
                if (selectedElement && selectedElement.id === element.id) {
                  const metrics = context.measureText(element.text)
                  context.strokeStyle = "#3b82f6"
                  context.lineWidth = 1
                  context.strokeRect(
                    element.x - 2,
                    element.y - (element.fontSize || 16),
                    metrics.width + 4,
                    (element.fontSize || 16) + 4
                  )

                  // Draw resize handles
                  const handleSize = 8
                  context.fillStyle = "#3b82f6"
                  // Top-left
                  context.fillRect(element.x - handleSize / 2, element.y - (element.fontSize || 16) - handleSize / 2, handleSize, handleSize)
                  // Top-right
                  context.fillRect(element.x + metrics.width - handleSize / 2, element.y - (element.fontSize || 16) - handleSize / 2, handleSize, handleSize)
                  // Bottom-left
                  context.fillRect(element.x - handleSize / 2, element.y + 4 - handleSize / 2, handleSize, handleSize)
                  // Bottom-right
                  context.fillRect(element.x + metrics.width - handleSize / 2, element.y + 4 - handleSize / 2, handleSize, handleSize)
                }
              }
              break

            case "sticker":
              if (element.x !== undefined && element.y !== undefined && element.stickerType) {
                context.font = "32px sans-serif"
                context.fillStyle = element.color
                context.fillText(element.stickerType, element.x, element.y)

                // Draw selection indicator if this element is selected
                if (selectedElement && selectedElement.id === element.id) {
                  const metrics = context.measureText(element.stickerType)
                  context.strokeStyle = "#3b82f6"
                  context.lineWidth = 1
                  context.strokeRect(
                    element.x - 2,
                    element.y - 32,
                    metrics.width + 4,
                    36
                  )

                  // Draw resize handles
                  const handleSize = 8
                  context.fillStyle = "#3b82f6"
                  // Top-left
                  context.fillRect(element.x - handleSize / 2, element.y - 32 - handleSize / 2, handleSize, handleSize)
                  // Top-right
                  context.fillRect(element.x + metrics.width - handleSize / 2, element.y - 32 - handleSize / 2, handleSize, handleSize)
                  // Bottom-left
                  context.fillRect(element.x - handleSize / 2, element.y + 4 - handleSize / 2, handleSize, handleSize)
                  // Bottom-right
                  context.fillRect(element.x + metrics.width - handleSize / 2, element.y + 4 - handleSize / 2, handleSize, handleSize)
                }
              }
              break

            case "arrow":
              if (element.points && element.points.length > 1) {
                const start = element.points[0]
                const end = element.points[element.points.length - 1]

                // Calculate arrowhead size and angle
                const lineWidth = element.lineWidth || 2
                const arrowSize = Math.max(25, lineWidth * 5)
                const angle = Math.atan2(end.y - start.y, end.x - start.x)
                const arrowAngle = Math.PI / 6 // Narrower angle for smaller triangle

                // Calculate the point where the line should stop before the arrowhead
                const lineEndX = end.x - (arrowSize * 0.3) * Math.cos(angle)
                const lineEndY = end.y - (arrowSize * 0.3) * Math.sin(angle)

                // Draw line stopping before arrowhead
                context.beginPath()
                context.moveTo(start.x, start.y)
                context.lineTo(lineEndX, lineEndY)
                context.stroke()

                // Draw arrowhead
                context.beginPath()
                context.moveTo(end.x, end.y)
                context.lineTo(
                  end.x - arrowSize * Math.cos(angle - arrowAngle),
                  end.y - arrowSize * Math.sin(angle - arrowAngle)
                )
                context.lineTo(
                  end.x - arrowSize * Math.cos(angle + arrowAngle),
                  end.y - arrowSize * Math.sin(angle + arrowAngle)
                )
                context.closePath()
                context.fill()

                // Draw selection indicator if this element is selected
                if (selectedElement && selectedElement.id === element.id) {
                  context.strokeStyle = "#3b82f6"
                  context.lineWidth = 1

                  // Draw selection rectangle
                  const bounds = {
                    minX: Math.min(start.x, end.x),
                    minY: Math.min(start.y, end.y),
                    maxX: Math.max(start.x, end.x),
                    maxY: Math.max(start.y, end.y)
                  }

                  context.strokeRect(
                    bounds.minX - 2,
                    bounds.minY - 2,
                    bounds.maxX - bounds.minX + 4,
                    bounds.maxY - bounds.minY + 4
                  )

                  // Draw resize handles
                  const handleSize = 8
                  context.fillStyle = "#3b82f6"
                  // Start point handle
                  context.fillRect(start.x - handleSize / 2, start.y - handleSize / 2, handleSize, handleSize)
                  // End point handle
                  context.fillRect(end.x - handleSize / 2, end.y - handleSize / 2, handleSize, handleSize)
                }
              }
              break

            case "triangle":
              if (element.x !== undefined && element.y !== undefined &&
                element.width !== undefined && element.height !== undefined) {
                context.beginPath()
                context.moveTo(element.x + element.width / 2, element.y)
                context.lineTo(element.x + element.width, element.y + element.height)
                context.lineTo(element.x, element.y + element.height)
                context.closePath()
                context.stroke()

                // Draw selection indicator if this element is selected
                if (selectedElement && selectedElement.id === element.id) {
                  context.strokeStyle = "#3b82f6"
                  context.lineWidth = 1

                  // Draw selection rectangle
                  context.strokeRect(
                    element.x - 2,
                    element.y - 2,
                    element.width + 4,
                    element.height + 4
                  )

                  // Draw resize handles
                  const handleSize = 8
                  context.fillStyle = "#3b82f6"
                  // Top point handle
                  context.fillRect(element.x + element.width / 2 - handleSize / 2, element.y - handleSize / 2, handleSize, handleSize)
                  // Bottom right point handle
                  context.fillRect(element.x + element.width - handleSize / 2, element.y + element.height - handleSize / 2, handleSize, handleSize)
                  // Bottom left point handle
                  context.fillRect(element.x - handleSize / 2, element.y + element.height - handleSize / 2, handleSize, handleSize)
                }
              }
              break

            case "line":
              if (element.x !== undefined && element.y !== undefined &&
                element.width !== undefined && element.height !== undefined) {
                context.beginPath()
                context.moveTo(element.x, element.y)
                context.lineTo(element.x + element.width, element.y + element.height)
                context.stroke()

                // Draw selection indicator if this element is selected
                if (selectedElement && selectedElement.id === element.id) {
                  context.strokeStyle = "#3b82f6"
                  context.lineWidth = 1

                  // Draw selection rectangle
                  const bounds = {
                    minX: Math.min(element.x, element.x + element.width),
                    minY: Math.min(element.y, element.y + element.height),
                    maxX: Math.max(element.x, element.x + element.width),
                    maxY: Math.max(element.y, element.y + element.height)
                  }

                  context.strokeRect(
                    bounds.minX - 2,
                    bounds.minY - 2,
                    bounds.maxX - bounds.minX + 4,
                    bounds.maxY - bounds.minY + 4
                  )

                  // Draw resize handles
                  const handleSize = 8
                  context.fillStyle = "#3b82f6"
                  // Start point handle
                  context.fillRect(element.x - handleSize / 2, element.y - handleSize / 2, handleSize, handleSize)
                  // End point handle
                  context.fillRect(element.x + element.width - handleSize / 2, element.y + element.height - handleSize / 2, handleSize, handleSize)
                }
              }
              break
          }
        })
      }
    })
  }

  // Add function to snap coordinates to grid
  const snapToGridPoint = (x: number, y: number) => {
    if (!snapToGrid) return { x, y }
    return {
      x: Math.round(x / GRID_SIZE) * GRID_SIZE,
      y: Math.round(y / GRID_SIZE) * GRID_SIZE
    }
  }

  // Update handleMouseDown to better handle resize initiation
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!context || !canvasRef.current) return

    const currentLayer = layers.find(layer => layer.id === activeLayer)
    if (currentLayer?.locked) {
      toast({
        title: "Layer Locked",
        description: "This layer is locked. Unlock it to make changes.",
        variant: "destructive",
      })
      return
    }

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()

    // Calculate the exact cursor position relative to the canvas
    let x = e.clientX - rect.left
    let y = e.clientY - rect.top

    // Apply grid snapping
    const snapped = snapToGridPoint(x, y)
    x = snapped.x
    y = snapped.y

    // Check if clicking on a sticky note
    const isClickingOnNote = elements.some(element =>
      element.type === "note" &&
      element.x !== undefined &&
      element.y !== undefined &&
      element.width !== undefined &&
      element.height !== undefined &&
      x >= element.x &&
      x <= element.x + element.width &&
      y >= element.y &&
      y <= element.y + element.height
    )

    // If clicking on a note and not using select tool, don't start drawing
    if (isClickingOnNote && currentTool !== "select") {
      return
    }

    setIsDrawing(true)

    // Update current user position
    setUsers((prevUsers) => prevUsers.map((user) => (user.id === 1 ? { ...user, x, y } : user)))

    // Handle eraser tool
    if (currentTool === "eraser") {
      handleErasing(x, y)
      return
    }

    // Handle select tool
    if (currentTool === "select") {
      // Check if we clicked on any element
      const clickedElement = elements.find(element => {
        if (!element) return false

        switch (element.type) {
          case "text":
            if (element.x !== undefined && element.y !== undefined && element.text) {
              const metrics = context.measureText(element.text)
              const handleSize = 8

              // Check for resize handles
              const isOnResizeHandle =
                (x >= element.x + metrics.width - handleSize && x <= element.x + metrics.width + handleSize &&
                  y >= element.y - (element.fontSize || 16) - handleSize && y <= element.y - (element.fontSize || 16) + handleSize) ? 'ne' :
                  (x >= element.x - handleSize && x <= element.x + handleSize &&
                    y >= element.y - (element.fontSize || 16) - handleSize && y <= element.y - (element.fontSize || 16) + handleSize) ? 'nw' :
                    (x >= element.x + metrics.width - handleSize && x <= element.x + metrics.width + handleSize &&
                      y >= element.y - handleSize && y <= element.y + handleSize) ? 'se' :
                      (x >= element.x - handleSize && x <= element.x + handleSize &&
                        y >= element.y - handleSize && y <= element.y + handleSize) ? 'sw' : null

              if (isOnResizeHandle) {
                setIsResizing(true)
                setResizeDirection(isOnResizeHandle)
                setOriginalSize({
                  width: metrics.width,
                  height: element.fontSize || 16,
                  x: element.x,
                  y: element.y
                })
                setResizeStartPoint({ x, y })
                return true
              }

              // Check if click is within the text bounds
              const isWithinBounds =
                x >= element.x - 2 &&
                x <= element.x + metrics.width + 2 &&
                y >= element.y - (element.fontSize || 16) - 2 &&
                y <= element.y + 4

              if (isWithinBounds) {
                setIsDragging(true)
                setDragOffset({
                  x: x - element.x,
                  y: y - element.y
                })
                return true
              }
            }
            return false

          case "pen":
          case "sticker":
            if (element.x !== undefined && element.y !== undefined) {
              const dx = x - element.x
              const dy = y - element.y
              return Math.sqrt(dx * dx + dy * dy) < 20 // 20px click radius
            }
            return false

          case "rectangle":
          case "circle":
          case "image":
          case "note":
            if (element.x !== undefined && element.y !== undefined &&
              element.width !== undefined && element.height !== undefined) {
              // Check if click is on resize handle
              const handleSize = 8
              const isOnResizeHandle =
                (x >= element.x + element.width - handleSize && x <= element.x + element.width + handleSize &&
                  y >= element.y + element.height - handleSize && y <= element.y + element.height + handleSize) ? 'se' :
                  (x >= element.x - handleSize && x <= element.x + handleSize &&
                    y >= element.y - handleSize && y <= element.y + handleSize) ? 'nw' :
                    (x >= element.x + element.width - handleSize && x <= element.x + element.width + handleSize &&
                      y >= element.y - handleSize && y <= element.y + handleSize) ? 'ne' :
                      (x >= element.x - handleSize && x <= element.x + handleSize &&
                        y >= element.y + element.height - handleSize && y <= element.y + element.height + handleSize) ? 'sw' : null

              if (isOnResizeHandle) {
                setIsResizing(true)
                setResizeDirection(isOnResizeHandle)
                setOriginalSize({
                  width: element.width,
                  height: element.height,
                  x: element.x,
                  y: element.y
                })
                setResizeStartPoint({ x, y })
                return true
              }

              return x >= element.x && x <= element.x + element.width &&
                y >= element.y && y <= element.y + element.height
            }
            return false

          case "arrow":
            if (element.points) {
              return element.points.some(point => {
                const dx = x - point.x
                const dy = y - point.y
                return Math.sqrt(dx * dx + dy * dy) < 10 // 10px click radius
              })
            }
            return false

          case "line":
            if (element.x !== undefined && element.y !== undefined &&
              element.width !== undefined && element.height !== undefined) {
              // Check if click is on resize handle
              const handleSize = 8
              const isOnResizeHandle =
                (x >= element.x - handleSize && x <= element.x + handleSize &&
                  y >= element.y - handleSize && y <= element.y + handleSize) ? 'nw' :
                  (x >= element.x + element.width - handleSize && x <= element.x + element.width + handleSize &&
                    y >= element.y + element.height - handleSize && y <= element.y + element.height + handleSize) ? 'se' : null

              if (isOnResizeHandle) {
                setIsResizing(true)
                setResizeDirection(isOnResizeHandle)
                setOriginalSize({
                  width: element.width,
                  height: element.height,
                  x: element.x,
                  y: element.y
                })
                setResizeStartPoint({ x, y })
                return true
              }

              // Check if click is near the line
              const isNearLine = (px: number, py: number) => {
                const lineLength = Math.sqrt(element.width * element.width + element.height * element.height)
                const distance = Math.abs(
                  (element.height * px - element.width * py + element.width * element.y - element.height * element.x) /
                  lineLength
                )
                return distance < 5
              }

              if (isNearLine(x, y)) {
                setIsDragging(true)
                setDragOffset({
                  x: x - element.x,
                  y: y - element.y
                })
                return true
              }
            }
            return false

          case "triangle":
            if (element.x !== undefined && element.y !== undefined &&
              element.width !== undefined && element.height !== undefined) {
              // Check if click is on resize handle
              const handleSize = 8
              const isOnResizeHandle =
                (x >= element.x + element.width / 2 - handleSize && x <= element.x + element.width / 2 + handleSize &&
                  y >= element.y - handleSize && y <= element.y + handleSize) ? 'ne' :
                  (x >= element.x + element.width - handleSize && x <= element.x + element.width + handleSize &&
                    y >= element.y + element.height - handleSize && y <= element.y + element.height + handleSize) ? 'se' :
                    (x >= element.x - handleSize && x <= element.x + handleSize &&
                      y >= element.y + element.height - handleSize && y <= element.y + element.height + handleSize) ? 'sw' : null

              if (isOnResizeHandle) {
                setIsResizing(true)
                setResizeDirection(isOnResizeHandle)
                setOriginalSize({
                  width: element.width,
                  height: element.height,
                  x: element.x,
                  y: element.y
                })
                setResizeStartPoint({ x, y })
                return true
              }

              // Check if click is inside the triangle
              const isInsideTriangle = (px: number, py: number) => {
                const x1 = element.x + element.width / 2
                const y1 = element.y
                const x2 = element.x + element.width
                const y2 = element.y + element.height
                const x3 = element.x
                const y3 = element.y + element.height

                const area = Math.abs((x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1)) / 2
                const area1 = Math.abs((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) / 2
                const area2 = Math.abs((x2 - px) * (y3 - py) - (x3 - px) * (y2 - py)) / 2
                const area3 = Math.abs((x3 - px) * (y1 - py) - (x1 - px) * (y3 - py)) / 2

                return Math.abs(area - (area1 + area2 + area3)) < 0.1
              }

              if (isInsideTriangle(x, y)) {
                setIsDragging(true)
                setDragOffset({
                  x: x - element.x,
                  y: y - element.y
                })
                return true
              }
            }
            return false

          default:
            return false
        }
      })

      if (clickedElement) {
        setSelectedElement(clickedElement)
        setIsDragging(true)
        setDragOffset({
          x: x - (clickedElement.x || 0),
          y: y - (clickedElement.y || 0)
        })
        return
      } else {
        setSelectedElement(null)
      }
    }

    const newElement: DrawingElement = {
      id: Date.now().toString(),
      type: currentTool,
      color: currentColor,
      userId: 1,
      lineWidth,
    }

    switch (currentTool) {
      case "pen":
      case "arrow":
        newElement.points = [{ x, y }]
        break

      case "rectangle":
      case "circle":
      case "triangle":
      case "star":
      case "line":
        newElement.x = x
        newElement.y = y
        newElement.width = 0
        newElement.height = 0
        break

      case "select":
        return
    }

    setCurrentElement(newElement)
  }

  const [textColor, setTextColor] = useState(currentColor)
  const [editingText, setEditingText] = useState<DrawingElement | null>(null)

  // Update handleTextSubmit to use textColor
  const handleTextSubmit = () => {
    if (textInputValue.trim()) {
      const canvas = canvasRef.current
      if (canvas) {
        const dpr = window.devicePixelRatio || 1
        const x = (canvas.width / dpr) / 2
        const y = (canvas.height / dpr) / 2

        const newElement: DrawingElement = {
          id: Date.now().toString(),
          type: "text",
          x,
          y,
          text: textInputValue,
          color: textColor, // Use textColor instead of currentColor
          userId: 1,
          lineWidth,
          fontSize: 16,
          width: 100,
          height: 20
        }
        addElement(newElement)

        if (context) {
          drawElements()
        }
      }
    }
    setShowTextInput(false)
    setTextInputValue("")
    setTextColor(currentColor) // Reset text color to current color
  }

  // Add text update handler
  const handleTextUpdate = () => {
    if (!editingText || !textInputValue.trim()) return

    const updatedElement = {
      ...editingText,
      text: textInputValue,
      color: textColor // Use textColor instead of currentColor
    }

    setElements(prevElements =>
      prevElements.map(el =>
        el.id === editingText.id ? updatedElement : el
      )
    )

    setLayers(prevLayers =>
      prevLayers.map(layer =>
        layer.id === activeLayer
          ? {
            ...layer,
            elements: layer.elements.map(el =>
              el.id === editingText.id ? updatedElement : el
            )
          }
          : layer
      )
    )

    setShowTextInput(false)
    setTextInputValue("")
    setEditingText(null)
    setTextColor(currentColor) // Reset text color to current color

    if (context) {
      drawElements()
    }
  }

  // Update handleDoubleClick to handle text editing
  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Find if we clicked on a text element
    const clickedText = elements.find(element =>
      element.type === "text" &&
      element.x !== undefined &&
      element.y !== undefined &&
      element.text &&
      x >= element.x - 2 &&
      x <= element.x + (context?.measureText(element.text).width || 0) + 2 &&
      y >= element.y - (element.fontSize || 16) - 2 &&
      y <= element.y + 4
    )

    // Find if we clicked on a note
    const clickedNote = elements.find(element =>
      element.type === "note" &&
      element.x !== undefined &&
      element.y !== undefined &&
      element.width !== undefined &&
      element.height !== undefined &&
      x >= element.x &&
      x <= element.x + element.width &&
      y >= element.y &&
      y <= element.y + element.height
    )

    if (clickedText) {
      setEditingText(clickedText)
      setTextInputValue(clickedText.text || "")
      setTextColor(clickedText.color)
      setShowTextInput(true)
    } else if (clickedNote) {
      setEditingNote(clickedNote)
      setNoteInputValue(clickedNote.text || "")
      setNoteColor(clickedNote.color)
      setShowNoteInput(true)
    }
  }

  // Update handleMouseMove to make resizing smoother
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()

    // Calculate the exact cursor position relative to the canvas
    let x = e.clientX - rect.left
    let y = e.clientY - rect.top

    // Apply grid snapping
    const snapped = snapToGridPoint(x, y)
    x = snapped.x
    y = snapped.y

    // Update current user position
    setUsers((prevUsers) => prevUsers.map((user) => (user.id === 1 ? { ...user, x, y } : user)))

    // Handle resizing
    if (isResizing && selectedElement && originalSize && resizeStartPoint) {
      const element = selectedElement
      let newWidth = originalSize.width
      let newHeight = originalSize.height
      let newX = originalSize.x
      let newY = originalSize.y

      // Calculate the change in position
      const dx = x - resizeStartPoint.x
      const dy = y - resizeStartPoint.y

      if (element.type === 'line') {
        // For lines, we only need to update the end point
        if (resizeDirection === 'se') {
          newWidth = originalSize.width + dx
          newHeight = originalSize.height + dy
        } else if (resizeDirection === 'nw') {
          newWidth = originalSize.width - dx
          newHeight = originalSize.height - dy
          newX = originalSize.x + dx
          newY = originalSize.y + dy
        }
      } else if (element.type === 'triangle') {
        // For triangles, handle each corner point
        if (resizeDirection === 'se') {
          // Bottom right point
          newWidth = originalSize.width + dx
          newHeight = originalSize.height + dy
        } else if (resizeDirection === 'sw') {
          // Bottom left point
          newWidth = originalSize.width - dx
          newHeight = originalSize.height + dy
          newX = originalSize.x + dx
        } else if (resizeDirection === 'ne') {
          // Top point
          newWidth = originalSize.width + dx
          newHeight = originalSize.height - dy
          newY = originalSize.y + dy
        }
      } else {
        // Calculate scale factors based on resize direction
        let scaleX = 1
        let scaleY = 1

        switch (resizeDirection) {
          case 'se':
            scaleX = (originalSize.width + dx) / originalSize.width
            scaleY = (originalSize.height + dy) / originalSize.height
            break
          case 'sw':
            scaleX = (originalSize.width - dx) / originalSize.width
            scaleY = (originalSize.height + dy) / originalSize.height
            newX = originalSize.x + dx
            break
          case 'ne':
            scaleX = (originalSize.width + dx) / originalSize.width
            scaleY = (originalSize.height - dy) / originalSize.height
            newY = originalSize.y + dy
            break
          case 'nw':
            scaleX = (originalSize.width - dx) / originalSize.width
            scaleY = (originalSize.height - dy) / originalSize.height
            newX = originalSize.x + dx
            newY = originalSize.y + dy
            break
        }

        // Ensure minimum size
        const minSize = 20
        if (scaleX * originalSize.width < minSize) {
          scaleX = minSize / originalSize.width
          if (resizeDirection === 'sw' || resizeDirection === 'nw') {
            newX = originalSize.x + originalSize.width - minSize
          }
        }
        if (scaleY * originalSize.height < minSize) {
          scaleY = minSize / originalSize.height
          if (resizeDirection === 'ne' || resizeDirection === 'nw') {
            newY = originalSize.y + originalSize.height - minSize
          }
        }

        if (element.type === 'circle') {
          // For circles, maintain aspect ratio
          const scale = Math.max(scaleX, scaleY)
          newWidth = Math.max(minSize, originalSize.width * scale)
          newHeight = newWidth // Keep it circular
        } else {
          newWidth = Math.max(minSize, originalSize.width * scaleX)
          newHeight = Math.max(minSize, originalSize.height * scaleY)
        }
      }

      // Update the element's position and size
      const updatedElement = {
        ...element,
        x: newX,
        y: newY,
        width: newWidth,
        height: newHeight
      }

      // Update the elements array
      setElements(prevElements =>
        prevElements.map(el =>
          el.id === selectedElement.id ? updatedElement : el
        )
      )

      // Update the layers
      setLayers(prevLayers =>
        prevLayers.map(layer =>
          layer.id === activeLayer
            ? {
              ...layer,
              elements: layer.elements.map(el =>
                el.id === selectedElement.id ? updatedElement : el
              )
            }
            : layer
        )
      )

      // Force a redraw
      if (context) {
        drawElements()
      }
      return
    }

    // Handle dragging selected element
    if (isDragging && selectedElement) {
      const newX = x - dragOffset.x
      const newY = y - dragOffset.y

      // Update state and redraw in a single animation frame
      requestAnimationFrame(() => {
        const updatedElements = elements.map(element =>
          element.id === selectedElement.id
            ? {
              ...element,
              x: newX,
              y: newY,
              points: element.points?.map(point => ({
                x: point.x + (newX - (element.x || 0)),
                y: point.y + (newY - (element.y || 0))
              }))
            }
            : element
        )

        setElements(updatedElements)
        setLayers(prevLayers =>
          prevLayers.map(layer =>
            layer.id === activeLayer
              ? { ...layer, elements: updatedElements }
              : layer
          )
        )

        if (context) {
          drawElements()
        }
      })
      return
    }

    // If not drawing, just update cursor position and return
    if (!isDrawing || !currentElement) return

    // Check if current position is on a sticky note
    const isOnNote = elements.some(element =>
      element.type === "note" &&
      element.x !== undefined &&
      element.y !== undefined &&
      element.width !== undefined &&
      element.height !== undefined &&
      x >= element.x &&
      x <= element.x + element.width &&
      y >= element.y &&
      y <= element.y + element.height
    )

    // If on a note, stop drawing
    if (isOnNote) {
      setIsDrawing(false)
      if (currentElement) {
        addElement(currentElement)
        setCurrentElement(null)
      }
      return
    }

    const updatedElement = { ...currentElement }

    switch (currentTool) {
      case "pen":
      case "arrow":
        if (currentTool === "pen") {
          // For pen tool, add point smoothing
          const points = updatedElement.points || []
          if (points.length > 0) {
            const lastPoint = points[points.length - 1]
            // Only add points if we've moved far enough (reduces number of points)
            const dx = x - lastPoint.x
            const dy = y - lastPoint.y
            const distance = Math.sqrt(dx * dx + dy * dy)

            if (distance > 2) { // Minimum distance between points
              // Add a smoothed point
              const smoothX = lastPoint.x + (dx * 0.5)
              const smoothY = lastPoint.y + (dy * 0.5)
              updatedElement.points = [...points, { x: smoothX, y: smoothY }, { x, y }]
            }
          } else {
            updatedElement.points = [{ x, y }]
          }
        } else {
          // For arrow tool, keep existing behavior
          updatedElement.points = [...(updatedElement.points || []), { x, y }]
        }
        break

      case "rectangle":
        if (updatedElement.x !== undefined && updatedElement.y !== undefined) {
          updatedElement.width = x - updatedElement.x
          updatedElement.height = y - updatedElement.y
        }
        break

      case "circle":
        if (updatedElement.x !== undefined && updatedElement.y !== undefined) {
          const dx = x - updatedElement.x
          const dy = y - updatedElement.y
          const radius = Math.sqrt(dx * dx + dy * dy)
          updatedElement.width = radius * 2
          updatedElement.height = radius * 2
        }
        break

      case "triangle":
        if (updatedElement.x !== undefined && updatedElement.y !== undefined) {
          updatedElement.width = x - updatedElement.x
          updatedElement.height = y - updatedElement.y
        }
        break

      case "star":
        if (updatedElement.x !== undefined && updatedElement.y !== undefined) {
          updatedElement.width = x - updatedElement.x
          updatedElement.height = y - updatedElement.y
        }
        break

      case "line":
        if (updatedElement.x !== undefined && updatedElement.y !== undefined) {
          updatedElement.width = x - updatedElement.x
          updatedElement.height = y - updatedElement.y
        }
        break
    }

    setCurrentElement(updatedElement)

    // Redraw everything including the current element
    if (context) {
      drawElements()

      // Draw the current element
      context.strokeStyle = updatedElement.color
      context.fillStyle = updatedElement.color
      context.lineWidth = updatedElement.lineWidth || lineWidth

      switch (updatedElement.type) {
        case "pen":
          if (updatedElement.points && updatedElement.points.length > 0) {
            context.beginPath()
            context.moveTo(updatedElement.points[0].x, updatedElement.points[0].y)

            updatedElement.points.forEach((point) => {
              context.lineTo(point.x, point.y)
            })

            context.stroke()
          }
          break

        case "rectangle":
          if (
            updatedElement.x !== undefined &&
            updatedElement.y !== undefined &&
            updatedElement.width !== undefined &&
            updatedElement.height !== undefined
          ) {
            context.beginPath()
            context.rect(updatedElement.x, updatedElement.y, updatedElement.width, updatedElement.height)
            context.stroke()
          }
          break

        case "circle":
          if (
            updatedElement.x !== undefined &&
            updatedElement.y !== undefined &&
            updatedElement.width !== undefined
          ) {
            const centerX = updatedElement.x + updatedElement.width / 2
            const centerY = updatedElement.y + updatedElement.width / 2
            const radius = updatedElement.width / 2

            context.beginPath()
            context.arc(centerX, centerY, radius, 0, Math.PI * 2)
            context.stroke()
          }
          break

        case "arrow":
          if (updatedElement.points && updatedElement.points.length > 1) {
            const start = updatedElement.points[0]
            const end = updatedElement.points[updatedElement.points.length - 1]

            // Calculate arrowhead size and angle
            const lineWidth = updatedElement.lineWidth || 2
            const arrowSize = Math.max(25, lineWidth * 5)
            const angle = Math.atan2(end.y - start.y, end.x - start.x)
            const arrowAngle = Math.PI / 6 // Narrower angle for smaller triangle

            // Calculate the point where the line should stop before the arrowhead
            const lineEndX = end.x - (arrowSize * 0.3) * Math.cos(angle)
            const lineEndY = end.y - (arrowSize * 0.3) * Math.sin(angle)

            // Draw line stopping before arrowhead
            context.beginPath()
            context.moveTo(start.x, start.y)
            context.lineTo(lineEndX, lineEndY)
            context.stroke()

            // Draw arrowhead
            context.beginPath()
            context.moveTo(end.x, end.y)
            context.lineTo(
              end.x - arrowSize * Math.cos(angle - arrowAngle),
              end.y - arrowSize * Math.sin(angle - arrowAngle)
            )
            context.lineTo(
              end.x - arrowSize * Math.cos(angle + arrowAngle),
              end.y - arrowSize * Math.sin(angle + arrowAngle)
            )
            context.closePath()
            context.fill()
          }
          break

        case "triangle":
          if (
            updatedElement.x !== undefined &&
            updatedElement.y !== undefined &&
            updatedElement.width !== undefined &&
            updatedElement.height !== undefined
          ) {
            context.beginPath()
            context.moveTo(updatedElement.x + updatedElement.width / 2, updatedElement.y)
            context.lineTo(updatedElement.x + updatedElement.width, updatedElement.y + updatedElement.height)
            context.lineTo(updatedElement.x, updatedElement.y + updatedElement.height)
            context.closePath()
            context.stroke()

            // Draw selection indicator if this element is selected
            if (selectedElement && selectedElement.id === element.id) {
              context.strokeStyle = "#3b82f6"
              context.lineWidth = 1

              // Draw selection rectangle
              context.strokeRect(
                element.x - 2,
                element.y - 2,
                element.width + 4,
                element.height + 4
              )

              // Draw resize handles
              const handleSize = 8
              context.fillStyle = "#3b82f6"
              // Top point handle
              context.fillRect(element.x + element.width / 2 - handleSize / 2, element.y - handleSize / 2, handleSize, handleSize)
              // Bottom right point handle
              context.fillRect(element.x + element.width - handleSize / 2, element.y + element.height - handleSize / 2, handleSize, handleSize)
              // Bottom left point handle
              context.fillRect(element.x - handleSize / 2, element.y + element.height - handleSize / 2, handleSize, handleSize)
            }
          }
          break

        case "star":
          if (
            updatedElement.x !== undefined &&
            updatedElement.y !== undefined &&
            updatedElement.width !== undefined &&
            updatedElement.height !== undefined
          ) {
            const spikes = 5
            const outerRadius = updatedElement.width / 2
            const innerRadius = outerRadius * 0.4
            const centerX = updatedElement.x + outerRadius
            const centerY = updatedElement.y + outerRadius

            context.beginPath()
            for (let i = 0; i < spikes * 2; i++) {
              const radius = i % 2 === 0 ? outerRadius : innerRadius
              const angle = (Math.PI * i) / spikes
              const x = centerX + Math.cos(angle) * radius
              const y = centerY + Math.sin(angle) * radius
              if (i === 0) {
                context.moveTo(x, y)
              } else {
                context.lineTo(x, y)
              }
            }
            context.closePath()
            context.stroke()
          }
          break

        case "line":
          if (
            updatedElement.x !== undefined &&
            updatedElement.y !== undefined &&
            updatedElement.width !== undefined &&
            updatedElement.height !== undefined
          ) {
            context.beginPath()
            context.moveTo(updatedElement.x, updatedElement.y)
            context.lineTo(updatedElement.x + updatedElement.width, updatedElement.y + updatedElement.height)
            context.stroke()
          }
          break
      }
    }
  }

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false)
    }
    if (isResizing) {
      setIsResizing(false)
      setResizeDirection(null)
      setOriginalSize(null)
      setResizeStartPoint(null)
    }
    if (!isDrawing || !currentElement) return

    // Send the element to other users via WebSocket
    if (ws) {
      ws.send(JSON.stringify({
        type: "draw",
        element: currentElement
      }))
    }

    addElement(currentElement)
    setCurrentElement(null)
    setIsDrawing(false)
  }

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      const previousElements = history[newIndex]

      // Batch all state updates together
      Promise.resolve().then(() => {
        setHistoryIndex(newIndex)
        setElements(previousElements)
        setLayers(prevLayers =>
          prevLayers.map(layer =>
            layer.id === activeLayer
              ? { ...layer, elements: previousElements }
              : layer
          )
        )
      })

      // Force immediate redraw
      if (context && canvasRef.current) {
        drawElements()
      }
    }
  }

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      const nextElements = history[newIndex]

      // Batch all state updates together
      Promise.resolve().then(() => {
        setHistoryIndex(newIndex)
        setElements(nextElements)
        setLayers(prevLayers =>
          prevLayers.map(layer =>
            layer.id === activeLayer
              ? { ...layer, elements: nextElements }
              : layer
          )
        )
      })

      // Force immediate redraw
      if (context && canvasRef.current) {
        drawElements()
      }
    }
  }

  const addElement = (element: DrawingElement) => {
    // Create new state
    const updatedElements = [...elements, element]

    // Update history
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(updatedElements)

    // Batch all state updates together
    Promise.resolve().then(() => {
      setHistory(newHistory)
      setHistoryIndex(newHistory.length - 1)
      setElements(updatedElements)
      setLayers(prevLayers =>
        prevLayers.map(layer =>
          layer.id === activeLayer
            ? { ...layer, elements: updatedElements }
            : layer
        )
      )
    })

    // Force immediate redraw
    if (context && canvasRef.current) {
      drawElements()
    }

    // Send to WebSocket if connected
    if (socket && isConnected) {
      socket.send(
        JSON.stringify({
          type: "draw",
          element,
          layerId: activeLayer
        })
      )
    }
  }

  // Update the keyboard shortcuts effect to use the latest functions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        if (e.shiftKey) {
          handleRedo()
        } else {
          handleUndo()
        }
      } else if (e.key === 'y' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        handleRedo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [history, historyIndex, elements, activeLayer]) // Add all dependencies

  const handleClear = () => {
    // Create new state
    const emptyElements: DrawingElement[] = []

    // Update history
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(emptyElements)

    // Update all states at once
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
    setElements(emptyElements)
    setLayers(prevLayers =>
      prevLayers.map(layer =>
        layer.id === activeLayer
          ? { ...layer, elements: emptyElements }
          : layer
      )
    )

    // Force immediate redraw
    requestAnimationFrame(() => {
      if (context && canvasRef.current) {
        context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
        if (showGrid) {
          drawGrid()
        }
      }
    })
  }

  const handleEraseBoard = () => {
    // Create new state
    const emptyElements: DrawingElement[] = []

    // Update history
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(emptyElements)

    // Update all states at once
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
    setElements(emptyElements)
    setLayers(prevLayers =>
      prevLayers.map(layer => ({
        ...layer,
        elements: emptyElements
      }))
    )

    // Force immediate redraw
    requestAnimationFrame(() => {
      if (context && canvasRef.current) {
        context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
        if (showGrid) {
          drawGrid()
        }
      }
    })

    // Clear localStorage
    try {
      localStorage.removeItem('whiteboard-elements')
      localStorage.removeItem('whiteboard-layers')
    } catch (e) {
      console.error('Failed to clear localStorage:', e)
    }

    // Notify other users
    if (socket && isConnected) {
      socket.send(
        JSON.stringify({
          type: "clear",
          userId: 1
        })
      )
    }
  }

  const handleDownload = () => {
    if (!canvasRef.current) return

    // Create a temporary canvas for the download
    const tempCanvas = document.createElement('canvas')
    const tempCtx = tempCanvas.getContext('2d')
    if (!tempCtx) return

    // Set the temporary canvas size to match the original
    const originalCanvas = canvasRef.current
    const dpr = window.devicePixelRatio || 1
    tempCanvas.width = originalCanvas.width
    tempCanvas.height = originalCanvas.height

    // Calculate the bounds of all elements
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    layers.forEach(layer => {
      if (layer.visible) {
        layer.elements.forEach(element => {
          switch (element.type) {
            case "pen":
              if (element.points) {
                element.points.forEach(point => {
                  minX = Math.min(minX, point.x)
                  minY = Math.min(minY, point.y)
                  maxX = Math.max(maxX, point.x)
                  maxY = Math.max(maxY, point.y)
                })
              }
              break
            case "rectangle":
            case "circle":
            case "image":
            case "note":
              if (element.x !== undefined && element.y !== undefined &&
                element.width !== undefined && element.height !== undefined) {
                minX = Math.min(minX, element.x)
                minY = Math.min(minY, element.y)
                maxX = Math.max(maxX, element.x + element.width)
                maxY = Math.max(maxY, element.y + element.height)
              }
              break
            case "text":
              if (element.x !== undefined && element.y !== undefined && element.text) {
                const metrics = tempCtx.measureText(element.text)
                minX = Math.min(minX, element.x)
                minY = Math.min(minY, element.y - (element.fontSize || 16))
                maxX = Math.max(maxX, element.x + metrics.width)
                maxY = Math.max(maxY, element.y)
              }
              break
            case "sticker":
              if (element.x !== undefined && element.y !== undefined && element.stickerType) {
                const metrics = tempCtx.measureText(element.stickerType)
                minX = Math.min(minX, element.x)
                minY = Math.min(minY, element.y - 32)
                maxX = Math.max(maxX, element.x + metrics.width)
                maxY = Math.max(maxY, element.y)
              }
              break
          }
        })
      }
    })

    // Add padding
    const padding = 50
    minX = Math.max(0, minX - padding)
    minY = Math.max(0, minY - padding)
    maxX = Math.min(originalCanvas.width, maxX + padding)
    maxY = Math.min(originalCanvas.height, maxY + padding)

    // Calculate the content dimensions
    const contentWidth = maxX - minX
    const contentHeight = maxY - minY

    // Set the temporary canvas size to match the content
    tempCanvas.width = contentWidth * dpr
    tempCanvas.height = contentHeight * dpr

    // Scale the context to ensure correct drawing
    tempCtx.scale(dpr, dpr)

    // Clear the temporary canvas with white background
    tempCtx.fillStyle = 'white'
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height)

    // Draw all elements with proper scaling and centering
    tempCtx.save()
    tempCtx.translate(-minX, -minY)

    layers.forEach(layer => {
      if (layer.visible) {
        layer.elements.forEach(element => {
          tempCtx.strokeStyle = element.color
          tempCtx.fillStyle = element.color
          tempCtx.lineWidth = element.lineWidth || 2

          switch (element.type) {
            case "pen":
              if (element.points && element.points.length > 0) {
                tempCtx.beginPath()
                tempCtx.moveTo(element.points[0].x, element.points[0].y)

                element.points.forEach((point) => {
                  tempCtx.lineTo(point.x, point.y)
                })

                tempCtx.stroke()
              }
              break

            case "rectangle":
              if (
                element.x !== undefined &&
                element.y !== undefined &&
                element.width !== undefined &&
                element.height !== undefined
              ) {
                tempCtx.beginPath()
                tempCtx.rect(element.x, element.y, element.width, element.height)
                tempCtx.stroke()
              }
              break

            case "circle":
              if (element.x !== undefined && element.y !== undefined && element.width !== undefined) {
                tempCtx.beginPath()
                tempCtx.arc(element.x + element.width / 2, element.y + element.width / 2, element.width / 2, 0, Math.PI * 2)
                tempCtx.stroke()
              }
              break

            case "text":
              if (element.x !== undefined && element.y !== undefined && element.text) {
                tempCtx.font = `${element.fontSize || 16}px Inter, sans-serif`
                tempCtx.fillText(element.text, element.x, element.y)
              }
              break

            case "sticker":
              if (element.x !== undefined && element.y !== undefined && element.stickerType) {
                tempCtx.font = "32px sans-serif"
                tempCtx.fillText(element.stickerType, element.x, element.y)
              }
              break

            case "image":
              if (
                element.x !== undefined &&
                element.y !== undefined &&
                element.width !== undefined &&
                element.height !== undefined &&
                element.imageUrl
              ) {
                const img = imageCache[element.imageUrl] || preloadImage(element.imageUrl)
                if (img.complete) {
                  tempCtx.drawImage(img, element.x, element.y, element.width, element.height)
                }
              }
              break

            case "arrow":
              if (element.points && element.points.length > 1) {
                const start = element.points[0]
                const end = element.points[element.points.length - 1]

                // Calculate arrowhead size and angle
                const lineWidth = element.lineWidth || 2
                const arrowSize = Math.max(25, lineWidth * 5)
                const angle = Math.atan2(end.y - start.y, end.x - start.x)
                const arrowAngle = Math.PI / 6

                // Calculate the point where the line should stop before the arrowhead
                const lineEndX = end.x - (arrowSize * 0.3) * Math.cos(angle)
                const lineEndY = end.y - (arrowSize * 0.3) * Math.sin(angle)

                // Draw line stopping before arrowhead
                tempCtx.beginPath()
                tempCtx.moveTo(start.x, start.y)
                tempCtx.lineTo(lineEndX, lineEndY)
                tempCtx.stroke()

                // Draw arrowhead
                tempCtx.beginPath()
                tempCtx.moveTo(end.x, end.y)
                tempCtx.lineTo(
                  end.x - arrowSize * Math.cos(angle - arrowAngle),
                  end.y - arrowSize * Math.sin(angle - arrowAngle)
                )
                tempCtx.lineTo(
                  end.x - arrowSize * Math.cos(angle + arrowAngle),
                  end.y - arrowSize * Math.sin(angle + arrowAngle)
                )
                tempCtx.closePath()
                tempCtx.fill()
              }
              break

            case "note":
              if (
                element.x !== undefined &&
                element.y !== undefined &&
                element.width !== undefined &&
                element.height !== undefined &&
                element.text
              ) {
                // Draw sticky note background
                tempCtx.fillStyle = element.color
                tempCtx.fillRect(element.x, element.y, element.width, element.height)
                // Draw text
                tempCtx.fillStyle = "#000000"
                tempCtx.font = "14px Inter, sans-serif"
                const words = element.text.split(" ")
                let line = ""
                const lineHeight = 18
                let offsetY = 20
                for (let i = 0; i < words.length; i++) {
                  const testLine = line + words[i] + " "
                  const metrics = tempCtx.measureText(testLine)
                  if (metrics.width > element.width - 20 && i > 0) {
                    tempCtx.fillText(line, element.x + 10, element.y + offsetY)
                    line = words[i] + " "
                    offsetY += lineHeight
                  } else {
                    line = testLine
                  }
                }
                tempCtx.fillText(line, element.x + 10, element.y + offsetY)
              }
              break
          }
        })
      }
    })

    tempCtx.restore()

    // Create download link
    const link = document.createElement("a")
    link.download = "brainboard.png"
    link.href = tempCanvas.toDataURL("image/png")
    link.click()
  }

  // Replace the handleAddSticker function with this improved version:
  const handleAddSticker = (stickerType: string) => {
    if (!canvasRef.current) return

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()

    // Get the current mouse position or use center of canvas
    const x = currentPosition ? currentPosition.x : rect.width / 2
    const y = currentPosition ? currentPosition.y : rect.height / 2

    const newElement: DrawingElement = {
      id: Date.now().toString(),
      type: "sticker",
      color: currentColor,
      userId: 1,
      x,
      y,
      stickerType,
    }

    // Add to history for undo/redo
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push([...elements, newElement])
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)

    // Add the sticker to the current layer
    setLayers(prevLayers =>
      prevLayers.map(layer =>
        layer.id === activeLayer
          ? { ...layer, elements: [...layer.elements, newElement] }
          : layer
      )
    )

    // Update elements state
    setElements(prevElements => [...prevElements, newElement])

    // Send to WebSocket if connected
    if (socket && isConnected) {
      socket.send(
        JSON.stringify({
          type: "draw",
          element: newElement,
          layerId: activeLayer
        })
      )
    }

    // Force redraw
    if (context) {
      drawElements()
    }

    setShowStickers(false)
    setCurrentPosition(null)
    setCurrentTool("select") // Switch back to select tool after adding sticker
  }

  // Replace the handleAddImage function with this improved version:
  const handleAddImage = (imageUrl: string) => {
    if (!canvasRef.current) return

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()

    // Calculate center position
    const x = (rect.width / 2) - 100 // Half of default image width
    const y = (rect.height / 2) - 100 // Half of default image height

    // Preload the image
    preloadImage(imageUrl)

    const newElement: DrawingElement = {
      id: Date.now().toString(),
      type: "image",
      color: currentColor,
      userId: 1,
      x,
      y,
      width: 200,
      height: 200,
      imageUrl,
    }

    addElement(newElement)
    setShowImageUploader(false)
  }

  const handleShare = (emails: string[], shareLink: string, boardId: string) => {
    toast({
      title: "Invitation sent!",
      description: `Invited ${emails.length} people to collaborate`,
    })

    // Store the board ID for future reference
    localStorage.setItem("brainboard-id", boardId)

    // Add simulated users
    if (emails.length > 0) {
      const newUser = {
        id: users.length + 1,
        name: emails[0].split("@")[0],
        avatar: "/placeholder.svg?height=40&width=40",
        color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
        x: Math.random() * 500,
        y: Math.random() * 500,
        online: false,
      }

      setUsers((prev) => [...prev, newUser])

      // Simulate user coming online after a delay
      setTimeout(() => {
        setUsers((prev) => prev.map((user) => (user.id === newUser.id ? { ...user, online: true } : user)))

        toast({
          title: `${newUser.name} joined`,
          description: "A new collaborator has joined your Brainboard",
        })
      }, 3000)
    }

    setShowShareDialog(false)
  }

  const handleLayerVisibilityChange = (layerId: string, visible: boolean) => {
    setLayers(prevLayers =>
      prevLayers.map(layer =>
        layer.id === layerId ? { ...layer, visible } : layer
      )
    )
  }

  const handleLayerLockChange = (layerId: string, locked: boolean) => {
    setLayers(prevLayers =>
      prevLayers.map(layer =>
        layer.id === layerId ? { ...layer, locked } : layer
      )
    )
  }

  const handleLayerMove = (layerId: string, direction: 'up' | 'down') => {
    setLayers(prevLayers => {
      const newLayers = [...prevLayers]
      const currentIndex = newLayers.findIndex(layer => layer.id === layerId)
      const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1

      if (newIndex >= 0 && newIndex < newLayers.length) {
        // Swap the layers
        [newLayers[currentIndex], newLayers[newIndex]] = [newLayers[newIndex], newLayers[currentIndex]]
      }

      return newLayers
    })
  }

  const handleLayerDelete = (layerId: string) => {
    if (layers.length > 1) {
      const remainingLayers = layers.filter(layer => layer.id !== layerId)
      const newActiveLayer = remainingLayers[0]

      setLayers(remainingLayers)
      setActiveLayer(newActiveLayer.id)
      setElements(newActiveLayer.elements)
    }
  }

  const handleAddLayer = () => {
    const newLayer: Layer = {
      id: Date.now().toString(),
      name: `Layer ${layers.length + 1}`,
      visible: true,
      locked: false,
      elements: []
    }

    setLayers(prevLayers => [...prevLayers, newLayer])
    setActiveLayer(newLayer.id)
    setElements([])
  }

  // Update handleErasing to properly remove elements
  const handleErasing = (x: number, y: number) => {
    // Get the current active layer
    const currentLayer = layers.find(layer => layer.id === activeLayer)
    if (!currentLayer) return

    // Find elements that intersect with the eraser
    const elementsToRemove = currentLayer.elements.filter(element => {
      // For all elements, check if the eraser point is within the eraser size
      const isNearPoint = (pointX: number, pointY: number) => {
        const dx = pointX - x
        const dy = pointY - y
        return Math.sqrt(dx * dx + dy * dy) < eraserSize
      }

      switch (element.type) {
        case "pen":
          if (element.points) {
            return element.points.some(point => isNearPoint(point.x, point.y))
          }
          return false

        case "rectangle":
          if (element.x !== undefined && element.y !== undefined &&
            element.width !== undefined && element.height !== undefined) {
            // Check if eraser point is near any of the rectangle's edges or corners
            const points = [
              { x: element.x, y: element.y }, // top-left
              { x: element.x + element.width, y: element.y }, // top-right
              { x: element.x, y: element.y + element.height }, // bottom-left
              { x: element.x + element.width, y: element.y + element.height }, // bottom-right
              { x: element.x + element.width / 2, y: element.y }, // top-center
              { x: element.x + element.width / 2, y: element.y + element.height }, // bottom-center
              { x: element.x, y: element.y + element.height / 2 }, // left-center
              { x: element.x + element.width, y: element.y + element.height / 2 } // right-center
            ]

            // Check if eraser is near any corner or edge point
            if (points.some(point => isNearPoint(point.x, point.y))) {
              return true
            }

            // Check if eraser is inside the rectangle
            if (x >= element.x && x <= element.x + element.width &&
              y >= element.y && y <= element.y + element.height) {
              return true
            }

            // Check if eraser is near any edge of the rectangle
            const isNearEdge = (
              (Math.abs(x - element.x) < eraserSize && y >= element.y && y <= element.y + element.height) || // left edge
              (Math.abs(x - (element.x + element.width)) < eraserSize && y >= element.y && y <= element.y + element.height) || // right edge
              (Math.abs(y - element.y) < eraserSize && x >= element.x && x <= element.x + element.width) || // top edge
              (Math.abs(y - (element.y + element.height)) < eraserSize && x >= element.x && x <= element.x + element.width) // bottom edge
            )

            return isNearEdge
          }
          return false

        case "circle":
          if (element.x !== undefined && element.y !== undefined && element.width !== undefined) {
            const centerX = element.x + element.width / 2
            const centerY = element.y + element.width / 2
            const radius = element.width / 2
            const dx = x - centerX
            const dy = y - centerY
            const distance = Math.sqrt(dx * dx + dy * dy)

            // Check if eraser is near the circle's edge or center
            if (Math.abs(distance - radius) < eraserSize || distance < eraserSize) {
              return true
            }

            // Check if eraser is near any point on the circle's circumference
            const angle = Math.atan2(dy, dx)
            const edgeX = centerX + radius * Math.cos(angle)
            const edgeY = centerY + radius * Math.sin(angle)
            const edgeDistance = Math.sqrt(Math.pow(x - edgeX, 2) + Math.pow(y - edgeY, 2))

            return edgeDistance < eraserSize
          }
          return false

        case "arrow":
          if (element.points && element.points.length > 1) {
            // Check if eraser is near any point in the arrow's path
            return element.points.some(point => isNearPoint(point.x, point.y))
          }
          return false

        case "text":
        case "sticker":
          if (element.x !== undefined && element.y !== undefined) {
            return isNearPoint(element.x, element.y)
          }
          return false

        case "image":
        case "note":
          if (element.x !== undefined && element.y !== undefined &&
            element.width !== undefined && element.height !== undefined) {
            // Check if eraser is near any corner or edge of the image/note
            const points = [
              { x: element.x, y: element.y }, // top-left
              { x: element.x + element.width, y: element.y }, // top-right
              { x: element.x, y: element.y + element.height }, // bottom-left
              { x: element.x + element.width, y: element.y + element.height }, // bottom-right
              { x: element.x + element.width / 2, y: element.y }, // top-center
              { x: element.x + element.width / 2, y: element.y + element.height }, // bottom-center
              { x: element.x, y: element.y + element.height / 2 }, // left-center
              { x: element.x + element.width, y: element.y + element.height / 2 } // right-center
            ]
            return points.some(point => isNearPoint(point.x, point.y))
          }
          return false

        default:
          return false
      }
    })

    if (elementsToRemove.length > 0) {
      // Remove the elements from the current layer
      const newElements = currentLayer.elements.filter(element => !elementsToRemove.includes(element))

      // Update the layers state
      setLayers(prevLayers =>
        prevLayers.map(layer =>
          layer.id === activeLayer
            ? { ...layer, elements: newElements }
            : layer
        )
      )

      // Update the elements state
      setElements(newElements)

      // Add to history for undo/redo
      const newHistory = history.slice(0, historyIndex + 1)
      newHistory.push([...elements])
      setHistory(newHistory)
      setHistoryIndex(newHistory.length - 1)

      // Redraw the canvas
      if (context && canvasRef.current) {
        drawElements()
      }
    }
  }

  const helpContent = [
    {
      title: "Drawing Tools",
      items: [
        "Select tool (S): Click and drag to select elements",
        "Pen tool (P): Draw freehand lines",
        "Rectangle tool (R): Click and drag to draw rectangles",
        "Circle tool (C): Click and drag to draw circles",
        "Arrow tool (A): Click and drag to create arrows",
        "Text tool (T): Click anywhere to add text",
        "Eraser tool (E): Click and drag to erase elements"
      ]
    },
    {
      title: "Insert Tools",
      items: [
        "Sticky Notes: Add text notes with background color",
        "Stickers: Add emoji and symbols",
        "Images: Upload and insert images",
        "Custom Colors: Use the color picker to create custom colors"
      ]
    },
    {
      title: "View & Organization",
      items: [
        "Layers: Organize elements in different layers",
        "Grid: Toggle grid for precise alignment",
        "Snap to Grid: Enable to align elements perfectly",
        "Zoom: Use mouse wheel to zoom in/out",
        "Pan: Hold Space + drag to move canvas"
      ]
    },
    {
      title: "Keyboard Shortcuts",
      items: [
        "Ctrl/Cmd + Z: Undo",
        "Ctrl/Cmd + Y: Redo",
        "Delete: Remove selected elements",
        "Ctrl/Cmd + C: Copy selected elements",
        "Ctrl/Cmd + V: Paste elements",
        "Ctrl/Cmd + S: Save board",
        "Esc: Cancel current operation"
      ]
    }
  ]

  const handleSave = () => {
    try {
      // Create a more compact save data structure
      const saveData = {
        layers: layers.map(layer => ({
          id: layer.id,
          name: layer.name,
          visible: layer.visible,
          locked: layer.locked,
          elements: layer.elements.map(element => ({
            id: element.id,
            type: element.type,
            points: element.points,
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height,
            text: element.text,
            color: element.color,
            userId: element.userId,
            stickerType: element.stickerType,
            imageUrl: element.imageUrl,
            lineWidth: element.lineWidth,
            fontSize: element.fontSize
          }))
        })),
        activeLayer,
        currentColor,
        lineWidth,
        showGrid,
        snapToGrid
      }

      // Save to localStorage with error handling
      try {
        localStorage.setItem('whiteboard-data', JSON.stringify(saveData))
        toast({
          title: "Saved!",
          description: "Your whiteboard has been saved successfully.",
        })
      } catch (storageError) {
        console.error('Storage error:', storageError)
        // If localStorage is full or unavailable, try to save a smaller version
        const minimalSaveData = {
          layers: layers.map(layer => ({
            id: layer.id,
            name: layer.name,
            visible: layer.visible,
            locked: layer.locked,
            elements: layer.elements
          })),
          activeLayer
        }
        localStorage.setItem('whiteboard-data', JSON.stringify(minimalSaveData))
        toast({
          title: "Saved (Minimal)",
          description: "Saved a minimal version of your whiteboard due to storage limitations.",
        })
      }
    } catch (e) {
      console.error('Failed to save whiteboard:', e)
      toast({
        title: "Error",
        description: "Failed to save whiteboard. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Update the auto-save effect to be more efficient
  useEffect(() => {
    let saveTimeout: NodeJS.Timeout

    const autoSave = () => {
      try {
        const saveData = {
          layers: layers.map(layer => ({
            id: layer.id,
            name: layer.name,
            visible: layer.visible,
            locked: layer.locked,
            elements: layer.elements
          })),
          activeLayer,
          currentColor,
          lineWidth,
          showGrid,
          snapToGrid
        }
        localStorage.setItem('whiteboard-data', JSON.stringify(saveData))
      } catch (e) {
        console.error('Failed to auto-save:', e)
      }
    }

    // Debounce the auto-save to prevent too frequent saves
    const debouncedAutoSave = () => {
      clearTimeout(saveTimeout)
      saveTimeout = setTimeout(autoSave, 5000) // Save after 5 seconds of inactivity
    }

    // Add event listeners for changes that should trigger auto-save
    const handleChange = () => {
      debouncedAutoSave()
    }

    // Listen for changes in relevant state
    handleChange()

    return () => {
      clearTimeout(saveTimeout)
    }
  }, [layers, activeLayer, currentColor, lineWidth, showGrid, snapToGrid])

  // Update the load effect to handle errors better
  useEffect(() => {
    try {
      const savedData = localStorage.getItem('whiteboard-data')
      if (savedData) {
        const data = JSON.parse(savedData)

        // Validate the data structure before applying
        if (data && typeof data === 'object') {
          if (Array.isArray(data.layers)) {
            setLayers(data.layers)
          }
          if (data.activeLayer) {
            setActiveLayer(data.activeLayer)
          }
          if (data.currentColor) {
            setCurrentColor(data.currentColor)
          }
          if (typeof data.lineWidth === 'number') {
            setLineWidth(data.lineWidth)
          }
          if (typeof data.showGrid === 'boolean') {
            setShowGrid(data.showGrid)
          }
          if (typeof data.snapToGrid === 'boolean') {
            setSnapToGrid(data.snapToGrid)
          }

          // Force a redraw after loading
          if (context && canvasRef.current) {
            drawElements()
          }
        }
      }
    } catch (e) {
      console.error('Failed to load saved data:', e)
      toast({
        title: "Error",
        description: "Failed to load saved data. Starting with a fresh whiteboard.",
        variant: "destructive",
      })
    }
  }, []) // Empty dependency array means this runs once on mount

  const [showNoteInput, setShowNoteInput] = useState(false)
  const [noteInputValue, setNoteInputValue] = useState("")
  const [notePosition, setNotePosition] = useState({ x: 0, y: 0 })
  const [noteColor, setNoteColor] = useState("#FFEB3B") // Default yellow color
  const [editingNote, setEditingNote] = useState<DrawingElement | null>(null)

  // Update createNote function to handle both new and existing notes
  const createNote = () => {
    if (!canvasRef.current || !noteInputValue.trim()) return

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()

    if (editingNote) {
      // Update existing note
      const updatedElement = {
        ...editingNote,
        color: noteColor,
        text: noteInputValue
      }

      setElements(prevElements =>
        prevElements.map(el =>
          el.id === editingNote.id ? updatedElement : el
        )
      )

      setLayers(prevLayers =>
        prevLayers.map(layer =>
          layer.id === activeLayer
            ? {
              ...layer,
              elements: layer.elements.map(el =>
                el.id === editingNote.id ? updatedElement : el
              )
            }
            : layer
        )
      )
    } else {
      // Create new note
      const x = (rect.width / 2) - 100 // Half of note width
      const y = (rect.height / 2) - 75 // Half of note height

      const newElement: DrawingElement = {
        id: Date.now().toString(),
        type: "note",
        x,
        y,
        width: 200,
        height: 150,
        color: noteColor,
        text: noteInputValue,
        userId: 1,
        lineWidth: 2
      }

      addElement(newElement)
    }

    setNoteInputValue("")
    setShowNoteInput(false)
    setEditingNote(null)
    setCurrentTool("select")
  }

  const [showPenSettings, setShowPenSettings] = useState(false)

  const [ws, setWs] = useState<ReturnType<typeof createWebSocket> | null>(null)

  const [showColorPicker, setShowColorPicker] = useState(false)
  const [pendingTool, setPendingTool] = useState<Tool | null>(null)

  return (
    <div className="flex flex-col h-[95vh] border rounded-lg overflow-hidden bg-slate-50 shadow-lg">
      <div className="flex items-center justify-between p-2 border-b bg-slate-50">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center space-x-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentTool("select")}
                    className={cn("rounded-md", currentTool === "select" && "bg-slate-200 hover:bg-slate-300")}
                  >
                    <MousePointer className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Select</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCurrentTool("pen")
                      setShowPenSettings(true)
                    }}
                    className={cn("rounded-md", currentTool === "pen" && "bg-slate-200 hover:bg-slate-300")}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Pen</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentTool("eraser")}
                    className={cn("rounded-md", currentTool === "eraser" && "bg-slate-200 hover:bg-slate-300")}
                  >
                    <Eraser className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Eraser</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <Separator orientation="vertical" className="h-6 mx-1" />

          <div className="flex items-center space-x-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPendingTool("rectangle")
                      setShowColorPicker(true)
                    }}
                    className={cn("rounded-md", currentTool === "rectangle" && "bg-slate-200 hover:bg-slate-300")}
                  >
                    <Square className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Rectangle</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPendingTool("circle")
                      setShowColorPicker(true)
                    }}
                    className={cn("rounded-md", currentTool === "circle" && "bg-slate-200 hover:bg-slate-300")}
                  >
                    <Circle className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Circle</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPendingTool("triangle")
                      setShowColorPicker(true)
                    }}
                    className={cn("rounded-md", currentTool === "triangle" && "bg-slate-200 hover:bg-slate-300")}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4"
                    >
                      <path d="M12 3L3 21h18L12 3z" />
                    </svg>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Triangle</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPendingTool("line")
                      setShowColorPicker(true)
                    }}
                    className={cn("rounded-md", currentTool === "line" && "bg-slate-200 hover:bg-slate-300")}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4"
                    >
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Straight Line</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPendingTool("arrow")
                      setShowColorPicker(true)
                    }}
                    className={cn("rounded-md", currentTool === "arrow" && "bg-slate-200 hover:bg-slate-300")}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5"
                    >
                      <path d="M3 12h16" />
                      <path d="M12 3l9 9-9 9" />
                    </svg>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Arrow</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <Separator orientation="vertical" className="h-6 mx-1" />

          <div className="flex items-center space-x-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCurrentTool("text")
                      setShowTextInput(true)
                    }}
                    className={cn("rounded-md", currentTool === "text" && "bg-slate-200 hover:bg-slate-300")}
                  >
                    <Type className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Text</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCurrentTool("note")
                      setShowNoteInput(true)
                    }}
                    className={cn("rounded-md", currentTool === "note" && "bg-slate-200 hover:bg-slate-300")}
                  >
                    <StickyNote className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Sticky Note</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCurrentTool("sticker")
                      setShowStickers(true)
                    }}
                    className={cn("rounded-md", currentTool === "sticker" && "bg-slate-200 hover:bg-slate-300")}
                  >
                    <Sticker className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Stickers</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCurrentTool("image")
                      setShowImageUploader(true)
                    }}
                    className={cn("rounded-md", currentTool === "image" && "bg-slate-200 hover:bg-slate-300")}
                  >
                    <ImageIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Add Image</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <Separator orientation="vertical" className="h-6 mx-1" />

          <div className="flex items-center space-x-2">
            <ColorPicker color={currentColor} onChange={setCurrentColor} />
          </div>

          <Separator orientation="vertical" className="h-6 mx-1" />

          <div className="flex items-center space-x-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleUndo}
                    disabled={historyIndex <= 0}
                    className="rounded-md"
                  >
                    <Undo className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRedo}
                    disabled={historyIndex >= history.length - 1}
                    className="rounded-md"
                  >
                    <Redo className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Redo (Ctrl+Y)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <Separator orientation="vertical" className="h-6 mx-1" />

          <div className="flex items-center space-x-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={handleEraseBoard} className="rounded-md">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Erase Board</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={handleDownload} className="rounded-md">
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Download</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <Separator orientation="vertical" className="h-6 mx-1" />

          <div className="flex items-center space-x-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={() => setShowShareDialog(true)} className="rounded-md">
                    <Share2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Share</TooltipContent>
              </Tooltip>
            </TooltipProvider>

          </div>

          <Separator orientation="vertical" className="h-6 mx-1" />

          <div className="flex items-center space-x-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSettings(true)}
                    className="rounded-md"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Settings</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowLayers(true)}
                    className="rounded-md"
                  >
                    <Layers className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Manage Layers</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpDialog />
                </TooltipTrigger>
                <TooltipContent>Help & Tips</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <Separator orientation="vertical" className="h-6 mx-1" />

          <div className="flex items-center space-x-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSave}
                    className="rounded-md"
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Save</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>

      <div className="relative flex-grow bg-slate-100">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full cursor-crosshair bg-white"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          style={{ touchAction: 'none' }}
        />

        {/* User cursors */}
        {users
          .filter((u) => u.online)
          .map((user) => (
            <div
              key={user.id}
              className="absolute pointer-events-none"
              style={{
                left: `${user.x / (canvasRef.current ? canvasRef.current.width / canvasRef.current.clientWidth : 1)}px`,
                top: `${user.y / (canvasRef.current ? canvasRef.current.height / canvasRef.current.clientHeight : 1)}px`,
                transition: user.id === 1 ? "none" : "all 0.5s ease-out",
                zIndex: 10,
              }}
            >
              {user.id !== 1 && (
                <div className="absolute -mt-6 -ml-4 whitespace-nowrap text-black text-xs px-1 py-0.5">
                  {user.name}
                </div>
              )}
            </div>
          ))}
      </div>

      {showUsers && (
        <div className="absolute top-16 right-2 z-50 bg-white rounded-lg shadow-lg border p-4 min-w-[200px]">
          <div className="space-y-2">
            <h3 className="font-medium mb-2">Connected Users</h3>
            {users.map((user) => (
              <div key={user.id} className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: user.color }} />
                <span className="text-sm">{user.name}</span>
                {user.online && <span className="text-xs text-green-500">• Online</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {showShareDialog && <ShareDialog onShare={handleShare} onCancel={() => setShowShareDialog(false)} />}
      {showStickers && <StickersPanel onSelect={handleAddSticker} onClose={() => setShowStickers(false)} />}
      {showImageUploader && <ImageUploader onUpload={handleAddImage} onClose={() => setShowImageUploader(false)} />}
      {showSettings && (
        <div className="absolute top-56 right-2 z-50">
          <SettingsPanel
            onClose={() => setShowSettings(false)}
            showGrid={showGrid}
            onShowGridChange={setShowGrid}
          />
        </div>
      )}
      {showLayers && (
        <LayersPanel
          layers={layers}
          activeLayer={activeLayer}
          onClose={() => setShowLayers(false)}
          onLayerVisibilityChange={handleLayerVisibilityChange}
          onLayerLockChange={handleLayerLockChange}
          onLayerMove={handleLayerMove}
          onLayerDelete={handleLayerDelete}
          onAddLayer={handleAddLayer}
          onLayerSelect={(layerId) => {
            const selectedLayer = layers.find(layer => layer.id === layerId)
            if (selectedLayer) {
              setActiveLayer(layerId)
              setElements(selectedLayer.elements)
            }
          }}
        />
      )}
      {showTextInput && (
        <Dialog open={showTextInput} onOpenChange={(open) => {
          setShowTextInput(open)
          if (!open) {
            setEditingText(null)
            setTextInputValue("")
            setTextColor(currentColor)
          }
        }}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{editingText ? "Edit Text" : "Add Text"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Text Color</label>
                <div className="flex items-center gap-2">
                  <ColorPicker color={textColor} onChange={setTextColor} />
                </div>
              </div>
              <Input
                value={textInputValue}
                onChange={(e) => setTextInputValue(e.target.value)}
                placeholder="Enter your text..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    editingText ? handleTextUpdate() : handleTextSubmit()
                  }
                }}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => {
                  setShowTextInput(false)
                  setEditingText(null)
                  setTextInputValue("")
                  setTextColor(currentColor)
                }}>
                  Cancel
                </Button>
                <Button onClick={editingText ? handleTextUpdate : handleTextSubmit}>
                  {editingText ? "Update" : "Add Text"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {showNoteInput && (
        <Dialog open={showNoteInput} onOpenChange={(open) => {
          setShowNoteInput(open)
          if (!open) {
            setEditingNote(null)
            setNoteInputValue("")
            setNoteColor("#FFEB3B")
          }
        }}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{editingNote ? "Edit Sticky Note" : "Add Sticky Note"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Note Color</label>
                <div className="flex items-center gap-2">
                  <ColorPicker color={noteColor} onChange={setNoteColor} />
                  <div className="flex-1">
                    <Input
                      value={noteInputValue}
                      onChange={(e) => setNoteInputValue(e.target.value)}
                      placeholder="Enter your note..."
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          createNote()
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => {
                  setShowNoteInput(false)
                  setEditingNote(null)
                  setNoteInputValue("")
                  setNoteColor("#FFEB3B")
                  setCurrentTool("select")
                }}>
                  Cancel
                </Button>
                <Button onClick={createNote}>
                  {editingNote ? "Update" : "Add Note"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {showPenSettings && (
        <Dialog open={showPenSettings} onOpenChange={setShowPenSettings}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Pen Settings</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="flex items-center space-x-4">
                <span className="text-sm font-medium">Width</span>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={lineWidth}
                  onChange={(e) => setLineWidth(Number.parseInt(e.target.value))}
                  className="flex-1 h-6 accent-slate-600 
                    [&::-webkit-slider-runnable-track]:h-1.5 
                    [&::-webkit-slider-runnable-track]:rounded-full
                    [&::-webkit-slider-runnable-track]:bg-slate-300
                    [&::-webkit-slider-thumb]:h-4 
                    [&::-webkit-slider-thumb]:w-4 
                    [&::-webkit-slider-thumb]:rounded-full
                    [&::-webkit-slider-thumb]:bg-slate-600
                    [&::-webkit-slider-thumb]:appearance-none
                    [&::-webkit-slider-thumb]:-mt-1
                    [&::-moz-range-track]:h-1.5
                    [&::-moz-range-track]:rounded-full
                    [&::-moz-range-track]:bg-slate-300
                    [&::-moz-range-thumb]:h-4 
                    [&::-moz-range-thumb]:w-4 
                    [&::-moz-range-thumb]:rounded-full
                    [&::-moz-range-thumb]:bg-slate-600
                    [&::-moz-range-thumb]:-mt-1"
                />
                <div className="flex items-center justify-center w-8 h-8 bg-white border rounded-md">
                  <span className="text-sm font-medium">{lineWidth}</span>
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setShowPenSettings(false)}>Done</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {showColorPicker && (
        <Dialog open={showColorPicker} onOpenChange={setShowColorPicker}>
          <DialogContent className="sm:max-w-[425px] fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
            <DialogHeader>
              <DialogTitle>Choose Color for {pendingTool === 'circle' ? 'Circle' : 'Rectangle'}</DialogTitle>
              <p className="text-sm text-muted-foreground">Select a color before creating your shape</p>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="flex flex-col space-y-3">
                <label className="text-sm font-medium">Selected Color</label>
                <div className="flex flex-col gap-2">
                  <div
                    className="w-10 h-10 rounded-md border"
                    style={{ backgroundColor: currentColor }}
                  />
                  <div className="overflow-y-auto mt-4" style={{ maxHeight: "200px" }}>
                    <div className="relative left-0 bottom-0">
                      <ColorPicker color={currentColor} onChange={setCurrentColor} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="outline" onClick={() => {
                setPendingTool(null)
                setShowColorPicker(false)
              }}>
                Cancel
              </Button>
              <Button onClick={() => {
                if (pendingTool) {
                  setCurrentTool(pendingTool)
                  setPendingTool(null)
                }
                setShowColorPicker(false)
              }}>
                Confirm Color
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
